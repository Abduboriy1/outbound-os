import type { GoalPeriod } from "~~/server/generated/prisma/client";

/**
 * Goal periods are computed in UTC. Sales targets are counted per calendar
 * window, and a fixed reference frame keeps a snapshot written by the worker
 * identical to the one rendered in the browser regardless of where either runs.
 */
export type PeriodRange = { start: Date; end: Date };

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** The window a goal of this period is currently being measured over. */
export function periodRange(period: GoalPeriod, now: Date): PeriodRange {
  const day = startOfUtcDay(now);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  switch (period) {
    case "DAILY":
      return { start: day, end: addUtcDays(day, 1) };
    case "WEEKLY": {
      // ISO weeks start on Monday; getUTCDay() puts Sunday at 0.
      const offset = (now.getUTCDay() + 6) % 7;
      const start = addUtcDays(day, -offset);
      return { start, end: addUtcDays(start, 7) };
    }
    case "MONTHLY":
      return {
        start: new Date(Date.UTC(year, month, 1)),
        end: new Date(Date.UTC(year, month + 1, 1)),
      };
    case "QUARTERLY": {
      const quarter = Math.floor(month / 3);
      return {
        start: new Date(Date.UTC(year, quarter * 3, 1)),
        end: new Date(Date.UTC(year, quarter * 3 + 3, 1)),
      };
    }
  }
}

/** The window immediately before the current one — used for trend deltas. */
export function previousPeriodRange(period: GoalPeriod, now: Date): PeriodRange {
  const current = periodRange(period, now);
  // One millisecond before the current start always lands in the prior window,
  // which keeps month and quarter lengths correct without calendar arithmetic.
  return periodRange(period, new Date(current.start.getTime() - 1));
}

/**
 * True when `snapshotStart` belongs to an earlier window than `now`, meaning a
 * stored GoalProgress row is stale and a fresh period has begun (plan §6).
 */
export function hasRolledOver(
  snapshotStart: Date,
  period: GoalPeriod,
  now: Date,
): boolean {
  return periodRange(period, now).start.getTime() !== snapshotStart.getTime();
}

/** Fraction of the current window that has already elapsed, clamped to 0..1. */
export function periodElapsedFraction(range: PeriodRange, now: Date): number {
  const span = range.end.getTime() - range.start.getTime();
  if (span <= 0) return 1;
  const elapsed = now.getTime() - range.start.getTime();
  return Math.min(1, Math.max(0, elapsed / span));
}

export const PERIOD_LABELS: Record<GoalPeriod, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
};

/**
 * Widened to accept the ISO strings a JSON response carries, because the pages
 * format a range that came back from `/api/goals`. A `PeriodRange` of real
 * Dates — what every server caller passes — is unaffected.
 */
export function formatPeriodRange(range: {
  start: Date | string;
  end: Date | string;
}): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const lastDay = new Date(new Date(range.end).getTime() - 1);
  return `${fmt.format(new Date(range.start))} – ${fmt.format(lastDay)}`;
}
