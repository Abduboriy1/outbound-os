/**
 * Research pipeline (plan §32).
 *
 *   Lead → gather public sources → extract → AI analysis → claims →
 *   pain signals → lead score → opportunities → human review
 *
 * Design rules this file follows:
 *  - Re-runnable. Every run rewrites the sources, claims, and signals attached
 *    to its report, so a second run never doubles the evidence.
 *  - Errors land on the report, not in the caller. A web request enqueues this
 *    and returns; a failure has to be visible in the queue UI, not a 500.
 *  - Nothing reaches a model except through AIService, and every retrieved page
 *    is passed as an untrusted document (plan §36).
 */

import type { Prisma, ResearchStatus } from "~~/server/generated/prisma/client";
import type { UntrustedDocument } from "~~/server/lib/contracts";
import { prisma } from "~~/server/lib/db";
import { audit } from "~~/server/lib/audit";
import { aiService } from "~~/server/lib/ai/service";
import {
  buildResearchRequest,
  normaliseResearch,
  researchOutputSchema,
  type ResearchOutput,
} from "~~/server/lib/ai/agents/research";
import {
  buildOpportunityRequest,
  normaliseOpportunities,
  opportunityOutputSchema,
  type Opportunity,
} from "~~/server/lib/ai/agents/opportunity";
import { scoreLeadById } from "~~/server/lib/scoring/persist";
import { gatherSources } from "./crawl";
import { createProgressLog } from "./progress";
import {
  harvestEmails,
  harvestPhones,
  mergeDiscoveredPeople,
  syncDiscoveredPeople,
} from "./people";
import {
  aiSignal,
  detectSignals,
  mergeSignals,
  type DetectedSignal,
  type SignalSource,
} from "./signals";
import { RESEARCH_PAYLOAD_VERSION, type ResearchPayload } from "./types";

const MAX_SOURCE_CHARS = 12_000;

export type RunResearchOptions = {
  leadId: string;
  userId: string;
  /** Re-run into an existing report instead of creating one. */
  reportId?: string;
  actorType?: "HUMAN" | "AI" | "SYSTEM";
};

export type RunResearchResult = {
  reportId: string;
  status: ResearchStatus;
  error?: string;
  signals: number;
  sources: number;
  opportunities: number;
};

export class LeadNotFoundError extends Error {
  constructor(leadId: string) {
    super(`Lead ${leadId} not found`);
    this.name = "LeadNotFoundError";
  }
}

/** Creates the PENDING report a job will pick up, so the queue UI has a row immediately. */
export async function createPendingReport(options: {
  leadId: string;
  userId: string;
}): Promise<string> {
  const lead = await prisma.lead.findFirst({
    where: { id: options.leadId, userId: options.userId, deletedAt: null },
    select: { id: true, companyId: true },
  });
  if (!lead) throw new LeadNotFoundError(options.leadId);

  const report = await prisma.researchReport.create({
    data: { leadId: lead.id, companyId: lead.companyId, status: "PENDING" },
    select: { id: true },
  });
  return report.id;
}

export async function runResearch(options: RunResearchOptions): Promise<RunResearchResult> {
  const lead = await prisma.lead.findFirst({
    where: { id: options.leadId, userId: options.userId, deletedAt: null },
    include: { company: true, contact: true, icp: true },
  });
  if (!lead) throw new LeadNotFoundError(options.leadId);

  const reportId =
    options.reportId ??
    (
      await prisma.researchReport.create({
        data: { leadId: lead.id, companyId: lead.companyId, status: "PENDING" },
        select: { id: true },
      })
    ).id;

  // A re-run's log describes the new run; `progress: []` drops the old one
  // along with the evidence rows below.
  await prisma.researchReport.update({
    where: { id: reportId },
    data: { status: "RUNNING", startedAt: new Date(), error: null, progress: [] },
  });

  // A re-run replaces its own evidence rather than appending to it.
  await prisma.researchClaim.deleteMany({ where: { reportId } });
  await prisma.researchSource.deleteMany({ where: { reportId } });

  const warnings: string[] = [];
  const progress = createProgressLog(reportId);

  try {
    await moveToResearching(lead.id, lead.stage, options.actorType ?? "SYSTEM", options.userId);

    /* ---------------------------------------------- 1. gather public sources */
    await progress.start(
      "company",
      "sources",
      `Fetching public pages for ${lead.company.name}`,
    );
    // The crawl reports every page read, link followed and search run into the
    // step log, so the whole hunt is auditable afterwards.
    const fetched = await gatherSources({
      company: {
        name: lead.company.name,
        domain: lead.company.domain,
        website: lead.company.website,
      },
      userId: options.userId,
      leadId: lead.id,
      warnings,
      emit: async (event) => {
        if (event.status === "started") {
          await progress.start(event.section, event.stage, event.label);
        } else if (event.status === "done") {
          await progress.done(event.section, event.stage, event.label, event.detail);
        } else {
          await progress.warn(event.section, event.stage, event.label, event.detail);
        }
      },
    });
    if (fetched.length === 0) {
      warnings.push("No public sources could be retrieved for this company.");
      await progress.warn("company", "sources", "No public pages could be retrieved");
    } else {
      await progress.done(
        "company",
        "sources",
        `Retrieved ${fetched.length} page${fetched.length === 1 ? "" : "s"}`,
        fetched
          .map((page) => page.title ?? page.url ?? page.kind)
          .slice(0, 6)
          .join(" · "),
      );
    }

    const sources = await Promise.all(
      fetched.map((page) =>
        prisma.researchSource.create({
          data: {
            companyId: lead.companyId,
            reportId,
            kind: page.kind,
            url: page.url,
            title: page.title,
            snippet: page.text.slice(0, MAX_SOURCE_CHARS),
            retrievedAt: new Date(),
          },
          select: { id: true, kind: true, url: true, title: true, snippet: true },
        }),
      ),
    );

    const documents: UntrustedDocument[] = sources.map((source) => ({
      label: source.title ?? source.url ?? source.kind,
      url: source.url ?? undefined,
      content: source.snippet ?? "",
    }));

    /* -------------------------------------------------- 2. AI analysis (§9) */
    await progress.start(
      "company",
      "analysis",
      "Reading the sources and building the intelligence report",
    );
    const research = await aiService().run({
      agent: "research",
      userId: options.userId,
      leadId: lead.id,
      schema: researchOutputSchema,
      request: buildResearchRequest({
        company: {
          name: lead.company.name,
          domain: lead.company.domain,
          website: lead.company.website,
          industry: lead.company.industry,
          location: lead.company.location,
          employeeCount: lead.company.employeeCount,
          description: lead.company.description,
        },
        icp: lead.icp
          ? {
              name: lead.icp.name,
              problems: lead.icp.problems,
              industries: lead.icp.industries,
              targetRoles: lead.icp.targetRoles,
            }
          : null,
        documents,
      }),
    });

    const knownUrls = sources.map((s) => s.url).filter((u): u is string => Boolean(u));
    const report: ResearchOutput = normaliseResearch(research.data, knownUrls);

    if (research.injectionFindings.length) {
      warnings.push(
        `${research.injectionFindings.length} instruction-shaped fragment(s) were removed from the retrieved pages before analysis.`,
      );
    }

    await progress.done(
      "company",
      "analysis",
      `Analysed ${sources.length} source${sources.length === 1 ? "" : "s"} with ${research.model}`,
      `${report.claims.length} claims · ${report.pain_signals.length} pain signals · confidence ${Math.round(report.research_confidence * 100)}%`,
    );

    /* ------------------------------------------------- 3. persist the claims */
    const urlToSourceId = new Map(
      sources.filter((s) => s.url).map((s) => [s.url as string, s.id]),
    );
    if (report.claims.length) {
      await prisma.researchClaim.createMany({
        data: report.claims.map((claim) => ({
          reportId,
          sourceId: claim.source_url ? (urlToSourceId.get(claim.source_url) ?? null) : null,
          type: claim.type,
          category: claim.category,
          text: claim.text,
          confidence: claim.confidence,
        })),
      });
    }

    /* --------------------------------------- 4. pain signal detection (§10) */
    const signalSources: SignalSource[] = sources.map((source) => ({
      id: source.id,
      label: source.title ?? source.url ?? source.kind,
      url: source.url ?? undefined,
      kind: source.kind,
      text: source.snippet ?? "",
    }));

    const ruleSignals = detectSignals(signalSources);
    const aiSignals = report.pain_signals
      .map((signal) =>
        aiSignal({
          type: signal.type,
          evidence: signal.evidence,
          sourceLabel: signal.source_label ?? "AI analysis",
          sourceUrl: signal.source_url ?? undefined,
          sourceId: signal.source_url ? urlToSourceId.get(signal.source_url) : undefined,
        }),
      )
      .filter((s): s is DetectedSignal => Boolean(s));

    const signals = mergeSignals(ruleSignals, aiSignals);
    await progress.done(
      "company",
      "signals",
      `Detected ${signals.length} signal${signals.length === 1 ? "" : "s"}`,
      signals
        .slice(0, 5)
        .map((signal) => signal.label)
        .join(" · ") || undefined,
    );

    /* --------------------------- 4b. people discovery → contacts (People tab) */
    let peopleSummary: NonNullable<ResearchPayload["people"]> = {
      found: 0,
      created: [],
      enriched: [],
    };
    try {
      await progress.start("people", "extract", "Looking for people and email addresses");
      const pageText = fetched.map((page) => ({ url: page.url ?? null, text: page.text }));
      const harvested = harvestEmails(pageText);
      const phones = harvestPhones(pageText);
      const people = mergeDiscoveredPeople(report.decision_makers, harvested);
      peopleSummary.phones = phones;
      await progress.done(
        "people",
        "extract",
        `Found ${people.length} ${people.length === 1 ? "person" : "people"}, ${harvested.length} email${harvested.length === 1 ? "" : "s"}, ${phones.length} phone/fax number${phones.length === 1 ? "" : "s"}`,
        [
          people
            .map((p) => p.name ?? p.email)
            .filter(Boolean)
            .slice(0, 6)
            .join(" · "),
          phones.map((p) => `${p.kind === "fax" ? "fax " : ""}${p.number}`).slice(0, 4).join(" · "),
        ]
          .filter(Boolean)
          .join(" — ") || undefined,
      );

      // The company's main line lands on the company record when it has none.
      const mainPhone = phones.find((p) => p.kind === "phone");
      if (mainPhone && !lead.company.phone) {
        await prisma.company.update({
          where: { id: lead.companyId },
          data: { phone: mainPhone.number },
        });
        await progress.done(
          "people",
          "company-phone",
          `Saved ${mainPhone.number} as the company phone number`,
          mainPhone.sourceUrl ?? undefined,
        );
      }

      if (people.length) {
        await progress.start("people", "contacts", "Saving new people to the lead");
        const synced = await syncDiscoveredPeople({
          userId: options.userId,
          companyId: lead.companyId,
          people,
        });
        peopleSummary = { found: people.length, phones, ...synced };
        const parts = [
          synced.created.length &&
            `${synced.created.length} contact${synced.created.length === 1 ? "" : "s"} added`,
          synced.enriched.length &&
            `${synced.enriched.length} gained an email`,
          synced.matched && `${synced.matched} already known`,
        ].filter(Boolean);
        await progress.done(
          "people",
          "contacts",
          parts.length ? parts.join(" · ") : "Nothing new — everyone was already recorded",
          synced.created.map((c) => c.email ?? c.name).join(" · ") || undefined,
        );
      } else {
        await progress.warn(
          "people",
          "contacts",
          "No people or addresses appeared in the sources",
        );
      }
    } catch (error) {
      // People sync failing must not throw away a good research report.
      warnings.push(`People discovery failed: ${messageOf(error)}`);
      await progress.fail("people", "contacts", "People discovery failed", messageOf(error));
    }

    /* ------------------------------------ 5. write the payload, then score it */
    const payload: ResearchPayload = {
      version: RESEARCH_PAYLOAD_VERSION,
      summary: report.company_summary,
      signals,
      technologies: report.technology_signals,
      opportunities: [],
      people: peopleSummary,
      report,
      sources: sources.map((s) => ({
        id: s.id,
        kind: s.kind,
        url: s.url,
        title: s.title,
      })),
      provider: research.provider,
      model: research.model,
      generatedAt: new Date().toISOString(),
      warnings,
    };

    await prisma.researchReport.update({
      where: { id: reportId },
      data: {
        summary: report.company_summary,
        payload: payload as unknown as Prisma.InputJsonValue,
        confidence: report.research_confidence,
        model: research.model,
      },
    });

    // Scoring reads the payload we just wrote, so it must run after the update.
    await scoreLeadById({
      leadId: lead.id,
      userId: options.userId,
      actorType: options.actorType ?? "SYSTEM",
    });
    await progress.done("company", "scoring", "Recomputed the lead score");

    /* ------------------------------------- 6. opportunity generation (§11) */
    let opportunities: Opportunity[] = [];
    try {
      await progress.start("company", "opportunities", "Drafting opportunities from the evidence");
      const generated = await aiService().run({
        agent: "opportunity",
        userId: options.userId,
        leadId: lead.id,
        schema: opportunityOutputSchema,
        request: buildOpportunityRequest({
          company: {
            name: lead.company.name,
            industry: lead.company.industry,
            employeeCount: lead.company.employeeCount,
          },
          claims: report.claims.map((claim) => ({
            id: claim.id,
            type: claim.type,
            text: claim.text,
            source_url: claim.source_url,
          })),
          signals: signals.map((signal) => ({
            type: signal.type,
            evidence: signal.evidence,
            sourceUrl: signal.sourceUrl,
          })),
        }),
      });

      opportunities = normaliseOpportunities(
        generated.data,
        report.claims.map((c) => c.id),
      ).opportunities;

      await persistOpportunities(lead.id, lead.companyId, opportunities);
      await progress.done(
        "company",
        "opportunities",
        `Proposed ${opportunities.length} opportunit${opportunities.length === 1 ? "y" : "ies"}`,
        opportunities.map((o) => o.title).slice(0, 4).join(" · ") || undefined,
      );
    } catch (error) {
      // An opportunity failure must not throw away a good research report.
      warnings.push(`Opportunity generation failed: ${messageOf(error)}`);
      await progress.fail("company", "opportunities", "Opportunity generation failed", messageOf(error));
    }

    /* ------------------------------------------------------- 7. mark complete */
    const finalPayload: ResearchPayload = { ...payload, opportunities, warnings };
    await prisma.researchReport.update({
      where: { id: reportId },
      data: {
        status: "COMPLETE",
        completedAt: new Date(),
        payload: finalPayload as unknown as Prisma.InputJsonValue,
        error: null,
      },
    });

    await prisma.activity.create({
      data: {
        userId: options.userId,
        leadId: lead.id,
        companyId: lead.companyId,
        type: "RESEARCH_COMPLETED",
        summary: `Research complete: ${signals.length} signal${signals.length === 1 ? "" : "s"}, ${opportunities.length} opportunit${opportunities.length === 1 ? "y" : "ies"}`,
        detail: report.company_summary.slice(0, 1000),
        actorType: "AI",
        metadata: { reportId, sources: sources.length, model: research.model },
      },
    });

    await audit({
      userId: options.userId,
      actorType: "AI",
      action: "research.completed",
      entityType: "ResearchReport",
      entityId: reportId,
      metadata: { leadId: lead.id, sources: sources.length, signals: signals.length },
    });

    return {
      reportId,
      status: "COMPLETE",
      signals: signals.length,
      sources: sources.length,
      opportunities: opportunities.length,
    };
  } catch (error) {
    const message = messageOf(error);
    await progress.fail("company", "run", "Research run failed", message.slice(0, 500));
    await prisma.researchReport
      .update({
        where: { id: reportId },
        data: {
          status: "FAILED",
          error: message.slice(0, 2000),
          completedAt: new Date(),
        },
      })
      .catch((updateError) => console.error("[research] could not record failure", updateError));

    await audit({
      userId: options.userId,
      actorType: "SYSTEM",
      action: "research.failed",
      entityType: "ResearchReport",
      entityId: reportId,
      metadata: { leadId: options.leadId, error: message.slice(0, 500) },
    });

    return {
      reportId,
      status: "FAILED",
      error: message,
      signals: 0,
      sources: 0,
      opportunities: 0,
    };
  }
}

async function persistOpportunities(
  leadId: string,
  companyId: string,
  opportunities: Opportunity[],
) {
  if (!opportunities.length) return;

  const existing = await prisma.opportunity.findMany({
    where: { leadId },
    select: { title: true },
  });
  const known = new Set(existing.map((o) => o.title.toLowerCase().trim()));

  for (const opportunity of opportunities) {
    const title = opportunity.title.trim();
    if (!title || known.has(title.toLowerCase())) continue;
    known.add(title.toLowerCase());
    await prisma.opportunity.create({
      data: {
        leadId,
        companyId,
        title,
        problem: opportunity.problem,
        solution: opportunity.possible_solution,
        benefit: opportunity.potential_benefit,
        confidence: opportunity.opportunity_confidence,
        evidence: opportunity.supporting_evidence as unknown as Prisma.InputJsonValue,
        estimatedValueMin: opportunity.estimated_value_min ?? null,
        estimatedValueMax: opportunity.estimated_value_max ?? null,
      },
    });
  }
}

async function moveToResearching(
  leadId: string,
  currentStage: string,
  actorType: "HUMAN" | "AI" | "SYSTEM",
  userId: string,
) {
  if (currentStage !== "PROSPECT") return;
  await prisma.lead.update({ where: { id: leadId }, data: { stage: "RESEARCHING" } });
  await prisma.leadStageHistory.create({
    data: {
      leadId,
      previousStage: "PROSPECT",
      newStage: "RESEARCHING",
      reason: "Research started",
      actorType,
      actorId: userId,
    },
  });
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
