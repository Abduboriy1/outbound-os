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
import { getSearchProvider } from "./search";
import { SAMPLE_PATHS } from "./search/mock";
import {
  aiSignal,
  detectSignals,
  mergeSignals,
  type DetectedSignal,
  type SignalSource,
} from "./signals";
import { RESEARCH_PAYLOAD_VERSION, type ResearchPayload } from "./types";

/** Paths tried on a company's own website. Real, attributable sources. */
const SITE_PATHS = ["/", "/about", "/about-us", "/services", "/careers", "/jobs", "/news"];

const MAX_SOURCES = 8;
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

  await prisma.researchReport.update({
    where: { id: reportId },
    data: { status: "RUNNING", startedAt: new Date(), error: null },
  });

  // A re-run replaces its own evidence rather than appending to it.
  await prisma.researchClaim.deleteMany({ where: { reportId } });
  await prisma.researchSource.deleteMany({ where: { reportId } });

  const warnings: string[] = [];

  try {
    await moveToResearching(lead.id, lead.stage, options.actorType ?? "SYSTEM", options.userId);

    /* ---------------------------------------------- 1. gather public sources */
    const fetched = await gatherSources(lead.company, warnings);
    if (fetched.length === 0) {
      warnings.push("No public sources could be retrieved for this company.");
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

    /* ------------------------------------ 5. write the payload, then score it */
    const payload: ResearchPayload = {
      version: RESEARCH_PAYLOAD_VERSION,
      summary: report.company_summary,
      signals,
      technologies: report.technology_signals,
      opportunities: [],
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

    /* ------------------------------------- 6. opportunity generation (§11) */
    let opportunities: Opportunity[] = [];
    try {
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
    } catch (error) {
      // An opportunity failure must not throw away a good research report.
      warnings.push(`Opportunity generation failed: ${messageOf(error)}`);
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

/* ---------------------------------------------------------------- sources */

type FetchedPage = { kind: string; url: string; title: string; text: string };

async function gatherSources(
  company: { name: string; domain: string | null; website: string | null },
  warnings: string[],
): Promise<FetchedPage[]> {
  const provider = getSearchProvider();
  const pages: FetchedPage[] = [];
  const seen = new Set<string>();

  const base = baseUrl(company.website, company.domain);
  const candidates: { kind: string; url: string }[] = [];

  if (base) {
    const paths = provider.name === "mock" ? SAMPLE_PATHS : SITE_PATHS;
    for (const path of paths) {
      candidates.push({ kind: kindForPath(path), url: new URL(path, base).toString() });
    }
  } else {
    warnings.push("No website or domain recorded, so the company site could not be read.");
  }

  // Search results supplement the company's own site (job boards, news).
  try {
    const query = base ? `${company.name} ${new URL(base).hostname}` : company.name;
    const results = await provider.search(query, 5);
    for (const result of results) {
      candidates.push({ kind: kindForPath(result.url), url: result.url });
    }
  } catch (error) {
    warnings.push(`Search failed: ${messageOf(error)}`);
  }

  for (const candidate of candidates) {
    if (pages.length >= MAX_SOURCES) break;
    const key = candidate.url.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const page = await provider.fetchPage(candidate.url);
      if (!page?.text?.trim()) continue;
      pages.push({
        kind: candidate.kind,
        url: candidate.url,
        title: page.title || candidate.url,
        text: page.text,
      });
    } catch (error) {
      warnings.push(`Could not read ${candidate.url}: ${messageOf(error)}`);
    }
  }

  return pages;
}

function baseUrl(website: string | null, domain: string | null) {
  const raw = website?.trim() || (domain?.trim() ? `https://${domain.trim()}` : null);
  if (!raw) return null;
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).origin;
  } catch {
    return null;
  }
}

function kindForPath(value: string) {
  if (/career|job|vacanc|hiring/i.test(value)) return "JOB_POSTING";
  if (/news|blog|press/i.test(value)) return "NEWS";
  if (/about|team|company/i.test(value)) return "ABOUT";
  if (/service|product|solution/i.test(value)) return "SERVICES";
  return "WEBSITE";
}

/* ----------------------------------------------------------------- writes */

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
