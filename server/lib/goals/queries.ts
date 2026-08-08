import { prisma } from "~~/server/lib/db";
import type { GoalMetric, GoalPeriod } from "~~/server/generated/prisma/client";
import { computeAllGoalProgress, type GoalEvent, type GoalWithProgress } from "./progress";
import { periodRange } from "~~/shared/goals/periods";

/**
 * Widest window any active goal is measured over. Loading events once for that
 * window lets every goal be computed from a single pass instead of one query
 * per goal.
 */
function widestRange(periods: GoalPeriod[], now: Date) {
  const ranges = (periods.length ? periods : (["WEEKLY"] as GoalPeriod[])).map(
    (period) => periodRange(period, now),
  );
  return {
    start: new Date(Math.min(...ranges.map((r) => r.start.getTime()))),
    end: new Date(Math.max(...ranges.map((r) => r.end.getTime()))),
  };
}

/**
 * Flattens real sales activity into countable goal events. Every query is
 * scoped to the signed-in user and skips soft-deleted rows, per CONVENTIONS.
 */
export async function loadGoalEvents(
  userId: string,
  window: { start: Date; end: Date },
): Promise<GoalEvent[]> {
  const range = { gte: window.start, lt: window.end };
  const ownedLead = { userId, deletedAt: null };

  const [
    researched,
    contacts,
    outreach,
    replies,
    conversations,
    meetings,
    proposals,
    won,
  ] = await Promise.all([
    prisma.researchReport.findMany({
      where: { status: "COMPLETE", completedAt: range, lead: ownedLead },
      select: { completedAt: true },
    }),
    prisma.contact.findMany({
      where: { userId, deletedAt: null, createdAt: range },
      select: { createdAt: true },
    }),
    prisma.outreachDraft.findMany({
      where: { status: "SENT", sentAt: range, lead: ownedLead },
      select: { sentAt: true, variant: true },
    }),
    prisma.emailMessage.findMany({
      where: {
        direction: "INBOUND",
        bounced: false,
        sentAt: range,
        thread: { lead: ownedLead },
      },
      select: { sentAt: true, threadId: true },
    }),
    prisma.emailThread.findMany({
      where: {
        lead: ownedLead,
        messages: { some: { direction: "INBOUND", sentAt: range } },
      },
      select: { id: true, lastMessageAt: true },
    }),
    prisma.meeting.findMany({
      where: { scheduledAt: range, lead: ownedLead },
      select: { scheduledAt: true },
    }),
    prisma.proposal.findMany({
      where: { sentAt: range, lead: ownedLead },
      select: { sentAt: true },
    }),
    prisma.lead.findMany({
      where: { userId, deletedAt: null, wonAt: range },
      select: { wonAt: true },
    }),
  ]);

  const events: GoalEvent[] = [];
  const push = (metric: GoalMetric, at: Date | null) => {
    if (at) events.push({ metric, at });
  };

  for (const row of researched) push("COMPANIES_RESEARCHED", row.completedAt);
  for (const row of contacts) push("CONTACTS_IDENTIFIED", row.createdAt);
  for (const row of outreach) {
    // Anything that is not the opening message counts as a follow-up (plan §22).
    push(row.variant === "INITIAL" ? "OUTREACH_SENT" : "FOLLOW_UPS_SENT", row.sentAt);
  }
  for (const row of replies) push("REPLIES", row.sentAt);
  for (const row of conversations) push("CONVERSATIONS", row.lastMessageAt);
  for (const row of meetings) push("DISCOVERY_CALLS", row.scheduledAt);
  for (const row of proposals) push("PROPOSALS", row.sentAt);
  for (const row of won) push("DEALS_WON", row.wonAt);

  return events;
}

/** Active goals with progress computed from real activity. */
export async function loadGoalsWithProgress(
  userId: string,
  now = new Date(),
): Promise<GoalWithProgress[]> {
  const goals = await prisma.goal.findMany({
    where: { userId, isActive: true },
    orderBy: [{ period: "asc" }, { metric: "asc" }],
    select: { id: true, metric: true, period: true, target: true },
  });
  if (goals.length === 0) return [];

  const events = await loadGoalEvents(
    userId,
    widestRange(
      goals.map((g) => g.period),
      now,
    ),
  );
  return computeAllGoalProgress(goals, events, now);
}

/**
 * Persists a GoalProgress snapshot per goal for the window it currently sits
 * in. Writing one row per (goal, periodStart) is what makes rollover automatic:
 * a new period simply creates a new row and leaves history intact (plan §6).
 */
export async function snapshotGoalProgress(userId: string, now = new Date()) {
  const goals = await loadGoalsWithProgress(userId, now);
  await Promise.all(
    goals.map((goal) =>
      prisma.goalProgress.upsert({
        where: {
          goalId_periodStart: {
            goalId: goal.id,
            periodStart: goal.progress.periodStart,
          },
        },
        create: {
          goalId: goal.id,
          periodStart: goal.progress.periodStart,
          periodEnd: goal.progress.periodEnd,
          value: goal.progress.value,
        },
        update: { value: goal.progress.value, computedAt: now },
      }),
    ),
  );
  return goals;
}

/** Closed-out snapshots for a goal, newest first — the history strip on /goals. */
export async function loadGoalHistory(userId: string, goalId: string, take = 8) {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId } });
  if (!goal) return [];
  return prisma.goalProgress.findMany({
    where: { goalId },
    orderBy: { periodStart: "desc" },
    take,
  });
}
