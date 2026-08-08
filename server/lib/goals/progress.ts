import type { GoalMetric, GoalPeriod } from "~~/server/generated/prisma/client";
import { periodElapsedFraction, periodRange, type PeriodRange } from "~~/shared/goals/periods";

/**
 * One countable thing that happened. The DB layer flattens research reports,
 * sent outreach, replies, meetings, proposals and won deals into this shape so
 * the progress maths stays pure and testable (plan §6).
 */
export type GoalEvent = {
  metric: GoalMetric;
  at: Date;
  /** Defaults to 1. Present so a batch import can contribute several at once. */
  count?: number;
};

export type GoalProgress = {
  metric: GoalMetric | null;
  period: GoalPeriod;
  periodStart: Date;
  periodEnd: Date;
  value: number;
  target: number;
  /** Completion against target, 0..100, capped so a bar never overflows. */
  percent: number;
  /** How much of the window has elapsed, 0..100. */
  elapsedPercent: number;
  /** Target prorated to the elapsed fraction of the window. */
  expectedByNow: number;
  /** Positive when ahead of the prorated target, negative when behind. */
  pace: number;
  onPace: boolean;
};

export type ComputeOptions = {
  /** Only count events for this metric. Omit to count every event given. */
  metric?: GoalMetric;
  /** Target used for percent and pacing. Defaults to 0 (progress only). */
  target?: number;
};

/**
 * Counts the events that fall inside the goal's current window and reports how
 * that stacks up against the target, both absolutely and against the pace
 * needed to finish the period on time.
 *
 * Window boundaries are half-open: `start <= at < end`, so an event at exactly
 * midnight belongs to the period it opens and is never double counted.
 */
export function computeGoalProgress(
  events: GoalEvent[],
  period: GoalPeriod,
  now: Date,
  options: ComputeOptions = {},
): GoalProgress {
  const range = periodRange(period, now);
  const target = Math.max(0, options.target ?? 0);
  const value = countInRange(events, range, options.metric);
  const elapsed = periodElapsedFraction(range, now);
  const expectedByNow = Math.round(target * elapsed);

  return {
    metric: options.metric ?? null,
    period,
    periodStart: range.start,
    periodEnd: range.end,
    value,
    target,
    percent: target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0,
    elapsedPercent: Math.round(elapsed * 100),
    expectedByNow,
    pace: value - expectedByNow,
    onPace: value >= expectedByNow,
  };
}

export function countInRange(
  events: GoalEvent[],
  range: PeriodRange,
  metric?: GoalMetric,
): number {
  let total = 0;
  for (const event of events) {
    if (metric && event.metric !== metric) continue;
    const at = event.at.getTime();
    if (at < range.start.getTime() || at >= range.end.getTime()) continue;
    total += event.count ?? 1;
  }
  return total;
}

export type GoalDefinition = {
  id: string;
  metric: GoalMetric;
  period: GoalPeriod;
  target: number;
};

export type GoalWithProgress = GoalDefinition & { progress: GoalProgress };

/** Convenience wrapper: progress for a whole set of goals off one event list. */
export function computeAllGoalProgress(
  goals: GoalDefinition[],
  events: GoalEvent[],
  now: Date,
): GoalWithProgress[] {
  return goals.map((goal) => ({
    ...goal,
    progress: computeGoalProgress(events, goal.period, now, {
      metric: goal.metric,
      target: goal.target,
    }),
  }));
}

/**
 * The four label/link tables moved to `shared/goals/metrics.ts` so the goals
 * page and the dashboard can read them without importing `server/lib`
 * (MIGRATION.md §1). Re-exported here under the names every server-side
 * importer already uses.
 */
export {
  GOAL_METRICS,
  GOAL_METRIC_LABELS,
  GOAL_METRIC_LINKS,
  GOAL_PERIODS,
} from "~~/shared/goals/metrics";
