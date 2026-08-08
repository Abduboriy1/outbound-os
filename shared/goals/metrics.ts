import type { GoalMetric, GoalPeriod } from "~~/server/generated/prisma/client";

/**
 * The goal vocabulary. Moved out of `server/lib/goals/progress.ts` — which also
 * computes progress against Prisma rows and cannot be shared — so the goals
 * page and the dashboard can label a metric without a second copy
 * (MIGRATION.md §1). `progress.ts` re-exports all four.
 */

export const GOAL_METRIC_LABELS: Record<GoalMetric, string> = {
  COMPANIES_RESEARCHED: "Companies researched",
  CONTACTS_IDENTIFIED: "Decision makers identified",
  OUTREACH_SENT: "Personalised outreach sent",
  FOLLOW_UPS_SENT: "Follow-ups sent",
  REPLIES: "Replies received",
  CONVERSATIONS: "Conversations started",
  DISCOVERY_CALLS: "Discovery calls",
  PROPOSALS: "Proposals sent",
  DEALS_WON: "Deals won",
};

export const GOAL_METRICS = Object.keys(GOAL_METRIC_LABELS) as GoalMetric[];
export const GOAL_PERIODS: GoalPeriod[] = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
];

/** Where the user should go to move a given metric forward (plan §5 queue). */
export const GOAL_METRIC_LINKS: Record<GoalMetric, string> = {
  COMPANIES_RESEARCHED: "/research/queue",
  CONTACTS_IDENTIFIED: "/people",
  OUTREACH_SENT: "/outreach/approvals",
  FOLLOW_UPS_SENT: "/tasks",
  REPLIES: "/outreach/inbox",
  CONVERSATIONS: "/outreach/inbox",
  DISCOVERY_CALLS: "/deals/discovery",
  PROPOSALS: "/deals/proposals",
  DEALS_WON: "/deals/closed",
};
