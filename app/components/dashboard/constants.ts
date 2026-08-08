/**
 * The label / tone / link tables the ported pages need.
 *
 * Every value below now has exactly one definition, under `shared/`. This file
 * used to be a hand-maintained copy of `server/lib/stages.ts`,
 * `server/lib/goals/{progress,periods}.ts`,
 * `server/lib/analytics/{acquisition,revenue}.ts` and
 * `server/lib/leads/filters.ts`, because MIGRATION.md §1 forbids a page
 * importing `~~/server/lib/**` at runtime; the modules moved into `shared/`
 * instead and both sides import them from there. The re-export keeps the
 * `~/components/dashboard/constants` path the pages already use.
 */
export {
  ALL_STAGES,
  OFF_PIPELINE_STAGES,
  PIPELINE_STAGES,
  STAGE_LABELS,
  STAGE_TONES,
} from "~~/shared/stages";

export {
  GOAL_METRICS,
  GOAL_METRIC_LABELS,
  GOAL_METRIC_LINKS,
  GOAL_PERIODS,
} from "~~/shared/goals/metrics";

export {
  PERIOD_LABELS,
  formatPeriodRange,
  periodRange,
} from "~~/shared/goals/periods";
export type { PeriodRange } from "~~/shared/goals/periods";

export { SOURCE_LABELS } from "~~/shared/analytics/sources";

export { leadValue } from "~~/shared/analytics/lead-value";

export {
  BUCKET_LABELS,
  BUCKET_ORDER,
  dueBucket,
  groupByDue,
} from "~~/shared/leads/due";
export type { DueBucket, DueGroups } from "~~/shared/leads/due";

/**
 * `formatDate` from `src/components/leads/display.tsx`. It has no server
 * original — it was always a presentation helper — so it stays here.
 */
export function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}
