/**
 * Draft generation (plan §15, §16).
 *
 * Gathers everything the outreach agent is supposed to use — research claims,
 * contact role, pain hypothesis, prior messages, the user's tone, matched case
 * studies, the offer — runs the agent, and persists the result as a draft that
 * is `PENDING_APPROVAL`.
 *
 * Nothing in this file sends anything. A draft is the only output.
 */

import { prisma } from "~~/server/lib/db";
import { audit } from "~~/server/lib/audit";
import { HttpError } from "~~/server/lib/api";
import {
  runOutreachAgent,
  VARIANT_SPECS,
  type OutreachCaseStudy,
  type OutreachClaim,
  type OutreachInput,
  type OutreachVariant,
  type RegenerationHint,
} from "~~/server/lib/ai/agents/outreach";
import { aiRunner } from "./ai";
import { offerForUser } from "~~/shared/outreach/offer";

export type GenerateDraftInput = {
  userId: string;
  leadId: string;
  variant: OutreachVariant;
  /** Why this lead surfaced now, shown on the approval card. */
  reason?: string | null;
  regenerationOf?: string | null;
  regenerationHint?: RegenerationHint | null;
};

const MAX_CASE_STUDIES = 3;

export async function generateDraft(input: GenerateDraftInput) {
  const lead = await loadLeadContext(input.userId, input.leadId);

  const previous = input.regenerationOf
    ? await prisma.outreachDraft.findFirst({
        where: { id: input.regenerationOf, leadId: input.leadId },
        select: { subject: true, body: true, variant: true },
      })
    : null;

  const agentInput = await buildOutreachInput({
    lead,
    variant: input.variant,
    reason: input.reason ?? null,
    regenerationHint: input.regenerationHint ?? null,
    previousDraft: previous
      ? { subject: previous.subject, body: previous.body }
      : null,
  });

  const runner = await aiRunner();
  const { data, runId: aiRunId } = await runOutreachAgent(runner, {
    userId: input.userId,
    leadId: input.leadId,
    input: agentInput,
  });

  const spec = VARIANT_SPECS[input.variant];

  const draft = await prisma.outreachDraft.create({
    data: {
      leadId: input.leadId,
      contactId: lead.contactId,
      channel: spec.channel,
      variant: input.variant,
      subject: spec.wantsSubject ? (data.subject ?? null) : null,
      body: data.body,
      status: "PENDING_APPROVAL",
      reason: input.reason ?? defaultReason(lead),
      regenerationOf: input.regenerationOf ?? null,
      regenerationHint: input.regenerationHint ?? null,
      aiRunId,
    },
  });

  await prisma.activity.create({
    data: {
      userId: input.userId,
      leadId: input.leadId,
      companyId: lead.companyId,
      contactId: lead.contactId,
      type: "OUTREACH_DRAFTED",
      summary: `Outreach draft generated (${input.variant.toLowerCase()})`,
      detail: data.rationale,
      actorType: "AI",
      metadata: {
        draftId: draft.id,
        aiRunId,
        variant: input.variant,
        regenerationHint: input.regenerationHint ?? null,
        assumptions: data.assumptions,
        structure: data.structure,
      },
    },
  });

  await audit({
    userId: input.userId,
    actorType: "AI",
    action: "outreach.draft.generate",
    entityType: "outreach_draft",
    entityId: draft.id,
    metadata: {
      leadId: input.leadId,
      variant: input.variant,
      regenerationOf: input.regenerationOf ?? null,
      regenerationHint: input.regenerationHint ?? null,
      aiRunId,
    },
  });

  return { draft, output: data };
}

/* --------------------------------------------------------- context load */

export type LeadContext = Awaited<ReturnType<typeof loadLeadContext>>;

export async function loadLeadContext(userId: string, leadId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, userId, deletedAt: null },
    include: {
      company: true,
      contact: true,
      user: { select: { name: true, tone: true } },
      opportunities: {
        orderBy: { confidence: "desc" },
        take: 3,
      },
      researchReports: {
        where: { status: "COMPLETE" },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          claims: {
            orderBy: { confidence: "desc" },
            take: 30,
            include: { source: { select: { url: true } } },
          },
          sources: { select: { url: true, title: true } },
        },
      },
      emailThreads: {
        orderBy: { lastMessageAt: "desc" },
        include: { messages: { orderBy: { sentAt: "asc" } } },
      },
    },
  });

  if (!lead) throw new HttpError("Lead not found", 404);
  if (!lead.contact) {
    throw new HttpError("The lead has no contact to write to", 400);
  }
  return lead;
}

export async function buildOutreachInput(args: {
  lead: LeadContext;
  variant: OutreachVariant;
  reason: string | null;
  regenerationHint: RegenerationHint | null;
  previousDraft: { subject: string | null; body: string } | null;
}): Promise<OutreachInput> {
  const { lead } = args;
  const report = lead.researchReports[0];

  const claims: OutreachClaim[] = (report?.claims ?? []).map((claim) => ({
    type: claim.type,
    text: claim.text,
    source: claim.source?.url ?? null,
  }));

  const painSignals = (report?.claims ?? [])
    .filter((claim) => claim.category?.toLowerCase().includes("pain"))
    .map((claim) => claim.text);

  const caseStudies = await matchCaseStudies(
    lead.userId,
    lead.company.industry,
    lead.opportunities.map((o) => `${o.problem} ${o.solution}`).join(" "),
  );

  const priorMessages = lead.emailThreads
    .flatMap((thread) =>
      thread.messages.map((message) => ({
        direction: message.direction,
        subject: message.subject,
        body: message.body,
        sentAt: message.sentAt,
      })),
    )
    .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());

  return {
    variant: args.variant,
    tone: lead.user.tone,
    senderName: lead.user.name,
    offer: offerForUser(),
    company: {
      name: lead.company.name,
      industry: lead.company.industry,
      location: lead.company.location,
      employeeCount: lead.company.employeeCount,
      website: lead.company.website,
      description: lead.company.description,
    },
    contact: {
      firstName: lead.contact!.firstName,
      lastName: lead.contact!.lastName,
      title: lead.contact!.title,
      decisionRole: lead.contact!.decisionRole,
    },
    research: {
      summary: report?.summary ?? null,
      claims,
      painSignals,
    },
    painHypothesis: lead.opportunities[0]?.problem ?? null,
    opportunities: lead.opportunities.map((opportunity) => ({
      title: opportunity.title,
      problem: opportunity.problem,
      solution: opportunity.solution,
      benefit: opportunity.benefit,
    })),
    caseStudies,
    priorMessages,
    reason: args.reason,
    score: lead.overallScore,
    regenerationHint: args.regenerationHint,
    previousDraft: args.previousDraft,
  };
}

/**
 * Picks case studies by industry first, then by keyword overlap with the
 * opportunity. Deliberately simple and deterministic: a wrong case study is
 * worse than none, so nothing is included on a weak match.
 */
export async function matchCaseStudies(
  userId: string,
  industry: string | null,
  context: string,
): Promise<OutreachCaseStudy[]> {
  const all = await prisma.caseStudy.findMany({ where: { userId } });
  if (all.length === 0) return [];

  const words = new Set(
    context
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 4),
  );

  const scored = all.map((study) => {
    let score = 0;
    if (
      industry &&
      study.industry.toLowerCase().trim() === industry.toLowerCase().trim()
    ) {
      score += 10;
    }
    const haystack = `${study.problem} ${study.solution} ${study.businessResult}`
      .toLowerCase()
      .split(/[^a-z0-9]+/);
    for (const word of haystack) if (words.has(word)) score += 1;
    return { study, score };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CASE_STUDIES)
    .map(({ study }) => ({
      slug: study.slug,
      title: study.title,
      industry: study.industry,
      problem: study.problem,
      businessResult: study.businessResult,
    }));
}

function defaultReason(lead: LeadContext): string {
  const parts: string[] = [];
  if (lead.overallScore != null) parts.push(`score ${lead.overallScore}`);
  if (lead.opportunities[0]) parts.push(lead.opportunities[0].title);
  else if (lead.company.industry) parts.push(`${lead.company.industry} fit`);
  return parts.length ? parts.join(", ") : "Manually queued";
}
