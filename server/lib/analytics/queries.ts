import { prisma } from "~~/server/lib/db";
import { computeAcquisition } from "./acquisition";
import { breakdownBy, companySizeBand, summarisePerformance } from "./breakdown";
import { computeFunnel, weakestTransition } from "./funnel";
import { computeOutreachStats } from "./outreach";
import { computeRevenue } from "./revenue";
import type { AnalyticsLeadRow, DateWindow, ReplyRow, SentMessageRow } from "./types";

/**
 * Loads the row set every analytics figure is derived from (plan §30). One
 * query feeds the funnel, revenue and every performance breakdown, so the
 * numbers on the page can never disagree with each other.
 */
export async function loadAnalyticsLeads(
  userId: string,
  window?: DateWindow,
): Promise<AnalyticsLeadRow[]> {
  const leads = await prisma.lead.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(window ? { createdAt: { gte: window.start, lt: window.end } } : {}),
    },
    select: {
      id: true,
      stage: true,
      createdAt: true,
      wonAt: true,
      lostAt: true,
      lostReason: true,
      estimatedValueMin: true,
      estimatedValueMax: true,
      sourceType: true,
      company: { select: { industry: true, employeeCount: true } },
      icp: { select: { name: true } },
      stageHistory: { select: { newStage: true } },
      researchReports: {
        where: { status: "COMPLETE" },
        select: { id: true },
        take: 1,
      },
      opportunities: { select: { problem: true } },
    },
  });

  return leads.map((lead) => ({
    id: lead.id,
    stage: lead.stage,
    reachedStages: lead.stageHistory.map((h) => h.newStage),
    createdAt: lead.createdAt,
    wonAt: lead.wonAt,
    lostAt: lead.lostAt,
    lostReason: lead.lostReason,
    estimatedValueMin: lead.estimatedValueMin,
    estimatedValueMax: lead.estimatedValueMax,
    sourceType: lead.sourceType,
    researched: lead.researchReports.length > 0,
    icpName: lead.icp?.name ?? null,
    industry: lead.company.industry,
    employeeCount: lead.company.employeeCount,
    problems: lead.opportunities.map((o) => o.problem),
  }));
}

export async function loadOutreachRows(
  userId: string,
  window?: DateWindow,
): Promise<{ sent: SentMessageRow[]; replies: ReplyRow[]; optOuts: number }> {
  const sentWindow = window ? { gte: window.start, lt: window.end } : undefined;

  const [drafts, inbound, optOuts] = await Promise.all([
    prisma.outreachDraft.findMany({
      where: {
        lead: { userId, deletedAt: null },
        status: { in: ["SENT", "BOUNCED"] },
        ...(sentWindow ? { sentAt: sentWindow } : {}),
      },
      select: { sentAt: true, status: true },
    }),
    prisma.emailMessage.findMany({
      where: {
        direction: "INBOUND",
        thread: { lead: { userId, deletedAt: null } },
        ...(sentWindow ? { sentAt: sentWindow } : {}),
      },
      select: { intent: true, sentAt: true },
    }),
    prisma.suppressionEntry.count({
      where: {
        reason: "UNSUBSCRIBED",
        ...(sentWindow ? { createdAt: sentWindow } : {}),
      },
    }),
  ]);

  return {
    sent: drafts.map((d) => ({ sentAt: d.sentAt, bounced: d.status === "BOUNCED" })),
    replies: inbound.map((m) => ({ intent: m.intent, receivedAt: m.sentAt })),
    optOuts,
  };
}

export type AnalyticsReport = ReturnType<typeof buildAnalyticsReport>;

/** Assembles every §30 section from already-loaded rows. Pure by construction. */
export function buildAnalyticsReport(
  leads: AnalyticsLeadRow[],
  outreach: { sent: SentMessageRow[]; replies: ReplyRow[]; optOuts: number },
) {
  const funnel = computeFunnel(leads);
  return {
    acquisition: computeAcquisition(leads),
    outreach: computeOutreachStats(outreach.sent, outreach.replies, outreach.optOuts),
    funnel,
    weakest: weakestTransition(funnel),
    revenue: computeRevenue(leads),
    overall: summarisePerformance(leads),
    byIndustry: breakdownBy(leads, (row) => row.industry),
    byIcp: breakdownBy(leads, (row) => row.icpName, "No ICP assigned"),
    bySize: breakdownBy(leads, (row) => companySizeBand(row.employeeCount)),
    bySource: breakdownBy(leads, (row) => row.sourceType),
    byProblem: breakdownBy(leads, (row) => row.problems, "No problem identified"),
    lossReasons: breakdownBy(
      leads.filter((row) => row.lostAt !== null),
      (row) => row.lostReason,
      "Not recorded",
    ),
  };
}

export async function loadAnalyticsReport(userId: string, window?: DateWindow) {
  const [leads, outreach] = await Promise.all([
    loadAnalyticsLeads(userId, window),
    loadOutreachRows(userId, window),
  ]);
  return buildAnalyticsReport(leads, outreach);
}

/**
 * `monthlyTrend` moved to `shared/analytics/trend.ts` so the analytics page can
 * build the chart from `/api/leads` rows (MIGRATION.md §1). Re-exported here
 * under the name every server-side importer already uses; `AnalyticsLeadRow[]`
 * still satisfies its widened parameter type.
 */
export { monthlyTrend } from "~~/shared/analytics/trend";
export type { TrendBucket, TrendLeadRow } from "~~/shared/analytics/trend";
