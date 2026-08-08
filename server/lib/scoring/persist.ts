/**
 * Persisting a lead score (plan §12).
 *
 * A LeadScore row is written per computation so the history is visible when a
 * score moves, and the three numbers are denormalised onto the Lead so list
 * views stay a single query (see the schema comment on `Lead.fitScore`).
 */

import type { Prisma } from "~~/server/generated/prisma/client";
import { prisma } from "~~/server/lib/db";
import { audit } from "~~/server/lib/audit";
import { readResearchPayload } from "~~/server/lib/research/types";
import type { DetectedSignal } from "~~/server/lib/research/signals";
import { scoreLead, type LeadScoreResult, type ScoreInput } from "./compute";
import { parseWeights } from "~~/shared/scoring/weights";

export type ScoreLeadOptions = {
  leadId: string;
  userId: string;
  actorType?: "HUMAN" | "AI" | "SYSTEM";
};

/**
 * Recomputes and stores the score for one lead using whatever evidence exists
 * today. Safe to run repeatedly — it is called after research, after a contact
 * is added, and from the scoring queue.
 */
export async function scoreLeadById(
  options: ScoreLeadOptions,
): Promise<(LeadScoreResult & { leadScoreId: string }) | null> {
  const lead = await prisma.lead.findFirst({
    where: { id: options.leadId, userId: options.userId, deletedAt: null },
    include: {
      company: true,
      icp: true,
      contact: true,
    },
  });
  if (!lead) return null;

  const [report, contacts] = await Promise.all([
    prisma.researchReport.findFirst({
      where: { leadId: lead.id, status: "COMPLETE" },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    }),
    prisma.contact.findMany({
      where: { userId: options.userId, companyId: lead.companyId, deletedAt: null },
      select: { title: true, decisionRole: true },
    }),
  ]);

  const payload = readResearchPayload(report?.payload);
  const input: ScoreInput = {
    icp: lead.icp
      ? {
          name: lead.icp.name,
          industries: lead.icp.industries,
          geographies: lead.icp.geographies,
          targetRoles: lead.icp.targetRoles,
          problems: lead.icp.problems,
          minEmployees: lead.icp.minEmployees,
          maxEmployees: lead.icp.maxEmployees,
          minDealSize: lead.icp.minDealSize,
          maxDealSize: lead.icp.maxDealSize,
        }
      : null,
    company: {
      name: lead.company.name,
      industry: lead.company.industry,
      location: lead.company.location,
      employeeCount: lead.company.employeeCount,
      description: lead.company.description,
    },
    contacts,
    technologySignals: payload?.technologies ?? [],
    signals: (payload?.signals ?? []) as DetectedSignal[],
    expectedValue: lead.estimatedValueMax ?? lead.estimatedValueMin ?? null,
  };

  const weights = parseWeights(lead.icp?.weights ?? null);
  const result = scoreLead(input, weights);

  const previous = lead.overallScore;

  const [leadScore] = await prisma.$transaction([
    prisma.leadScore.create({
      data: {
        leadId: lead.id,
        fitScore: result.fitScore,
        opportunityScore: result.opportunityScore,
        overallScore: result.overallScore,
        fitBreakdown: result.fit as unknown as Prisma.InputJsonValue,
        opportunityBreakdown: result.opportunity as unknown as Prisma.InputJsonValue,
        rationale: result.rationale,
      },
      select: { id: true },
    }),
    prisma.lead.update({
      where: { id: lead.id },
      data: {
        fitScore: result.fitScore,
        opportunityScore: result.opportunityScore,
        overallScore: result.overallScore,
      },
    }),
  ]);

  // Only worth an Activity row when the number actually moved.
  if (previous !== result.overallScore) {
    await prisma.activity.create({
      data: {
        userId: options.userId,
        leadId: lead.id,
        companyId: lead.companyId,
        type: "SCORE_UPDATED",
        summary:
          previous == null
            ? `Scored ${result.overallScore}/100`
            : `Score moved ${previous} to ${result.overallScore}`,
        detail: result.rationale,
        actorType: options.actorType ?? "SYSTEM",
        metadata: {
          fit: result.fitScore,
          opportunity: result.opportunityScore,
          overall: result.overallScore,
        },
      },
    });
  }

  await audit({
    userId: options.userId,
    actorType: options.actorType ?? "SYSTEM",
    action: "lead.scored",
    entityType: "Lead",
    entityId: lead.id,
    metadata: {
      fit: result.fitScore,
      opportunity: result.opportunityScore,
      overall: result.overallScore,
    },
  });

  return { ...result, leadScoreId: leadScore.id };
}
