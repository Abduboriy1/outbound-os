import { prisma } from "~~/server/lib/db";
import { classifyFollowUp } from "~~/server/lib/outreach/followups";
import { periodRange } from "~~/shared/goals/periods";
import { computeFunnel } from "./funnel";
import { computeOutreachStats } from "./outreach";
import { computeRevenue } from "./revenue";
import { loadAnalyticsLeads, loadOutreachRows } from "./queries";

/**
 * Everything the dashboard needs to answer "what should I do today to generate
 * business?" (plan §5). The queue items are counts plus a destination, because
 * a number the user cannot act on is not worth showing.
 */
export type QueueItem = {
  key: string;
  label: string;
  count: number;
  href: string;
  tone: "accent" | "positive" | "warning" | "danger" | "neutral";
  hint: string;
};

export async function loadDailyQueue(userId: string, now = new Date()) {
  const ownedLead = { userId, deletedAt: null };
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000);

  const [awaitingApproval, openTasks, responded, meetings, needsResearch, followUpLeads] =
    await Promise.all([
      prisma.outreachDraft.count({
        where: { status: "PENDING_APPROVAL", lead: ownedLead },
      }),
      prisma.task.count({
        where: { userId, status: "OPEN", dueAt: { lte: now } },
      }),
      prisma.lead.count({ where: { ...ownedLead, stage: "RESPONDED" } }),
      prisma.meeting.count({
        where: { lead: ownedLead, scheduledAt: { gte: now, lt: weekAhead } },
      }),
      prisma.lead.count({
        where: {
          ...ownedLead,
          stage: { in: ["PROSPECT", "RESEARCHING"] },
          researchReports: { none: { status: "COMPLETE" } },
        },
      }),
      prisma.lead.findMany({
        where: { ...ownedLead, stage: { notIn: ["WON", "LOST", "CUSTOMER", "NOT_A_FIT", "DO_NOT_CONTACT"] } },
        select: {
          stage: true,
          nextAction: true,
          nextActionDueAt: true,
          lastActivityAt: true,
          lastContactedAt: true,
          createdAt: true,
        },
      }),
    ]);

  // A lead can be behind without an explicit Task row, so the queue counts both
  // the tasks the user created and the leads the follow-up rules flag.
  const overdueLeads = followUpLeads.filter((lead) => {
    const status = classifyFollowUp(lead, now).status;
    return status === "OVERDUE" || status === "DUE_TODAY";
  }).length;

  const items: QueueItem[] = [
    {
      key: "approvals",
      label: "leads waiting for outreach approval",
      count: awaitingApproval,
      href: "/outreach/approvals",
      tone: "accent",
      hint: "Nothing is sent without your approval.",
    },
    {
      key: "followups",
      label: "follow-ups due",
      count: Math.max(openTasks, overdueLeads),
      href: "/tasks",
      tone: "warning",
      hint: "Overdue next actions and open tasks.",
    },
    {
      key: "responded",
      label: "prospects responded",
      count: responded,
      href: "/outreach/inbox",
      tone: "positive",
      hint: "A live conversation is the most valuable thing in the pipeline.",
    },
    {
      key: "discovery",
      label: "discovery calls to prepare",
      count: meetings,
      href: "/deals/discovery",
      tone: "positive",
      hint: "Scheduled in the next seven days.",
    },
    {
      key: "research",
      label: "leads need research",
      count: needsResearch,
      href: "/research/queue",
      tone: "neutral",
      hint: "No completed research report yet.",
    },
  ];

  return items;
}

/** The §5 metrics row. Everything here is measured, nothing is a placeholder. */
export async function loadDashboardMetrics(userId: string, now = new Date()) {
  const week = periodRange("WEEKLY", now);

  const [leads, outreach, newThisWeek] = await Promise.all([
    loadAnalyticsLeads(userId),
    loadOutreachRows(userId),
    prisma.lead.count({
      where: {
        userId,
        deletedAt: null,
        createdAt: { gte: week.start, lt: week.end },
      },
    }),
  ]);

  const funnel = computeFunnel(leads);
  const revenue = computeRevenue(leads);
  const outreachStats = computeOutreachStats(
    outreach.sent,
    outreach.replies,
    outreach.optOuts,
  );
  const step = (key: string) => funnel.find((s) => s.key === key)?.count ?? 0;

  return {
    week,
    newThisWeek,
    researched: leads.filter((l) => l.researched).length,
    qualified: step("QUALIFIED"),
    outreachSent: outreachStats.sent,
    replies: outreachStats.replies,
    positiveReplies: outreachStats.positiveReplies,
    discoveryCalls: step("DISCOVERY"),
    proposals: step("PROPOSAL"),
    dealsWon: revenue.wonCount,
    pipelineValue: revenue.pipelineValue,
    weightedPipeline: revenue.weightedPipeline,
    averageDealSize: revenue.averageDealSize,
    responseRate: outreachStats.replyRate,
    discoveryConversionRate:
      funnel.find((s) => s.key === "DISCOVERY")?.conversionFromPrevious ?? 0,
    proposalCloseRate: funnel.find((s) => s.key === "WON")?.conversionFromPrevious ?? 0,
    funnel,
    revenue,
    outreachStats,
    leads,
  };
}
