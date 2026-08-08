/**
 * The HTTP calls that replace the source's server actions.
 *
 * Next server actions have no Nuxt equivalent (MIGRATION.md §2.3), so every
 * `actions.ts` function becomes a `$fetch` against a route in §4. Anything the
 * §4 table does not cover is marked `GAP:` below — the page still renders, and
 * the call will start working the moment the route lands, but today it answers
 * `{ error: "Resource not found" }`.
 *
 * Types come from `server/lib` through `import type` only, which MIGRATION.md
 * §1 explicitly allows because it is erased at compile time.
 */
import type { AnalyticsReport } from "~~/server/lib/analytics/queries";
import type { GoalWithProgress } from "~~/server/lib/goals/progress";
import type { SalesCoachOutput } from "~~/server/lib/ai/agents/salesCoach";
import type { WeeklyReviewOutput } from "~~/server/lib/analytics/coach";

/** Every endpoint wraps its payload; §5.2. */
export type Wrapped<T> = { data: T };

/** `transform` helper for `useFetch`, per MIGRATION.md §5.2. */
export function unwrap<T>(res: Wrapped<T>): T {
  return res.data;
}

/** JSON carries dates as ISO strings. */
export type Iso = string;

/* --------------------------------------------------------------- analytics */

export type AnalyticsResponse = AnalyticsReport & {
  period: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ALL";
  window: { start: Iso; end: Iso } | null;
};

/* ------------------------------------------------------------------- goals */

/** `/api/goals` returns `loadGoalsWithProgress`, with dates as ISO strings. */
export type GoalRow = Omit<GoalWithProgress, "progress"> & {
  progress: Omit<GoalWithProgress["progress"], "periodStart" | "periodEnd"> & {
    periodStart: Iso;
    periodEnd: Iso;
  };
};

/* ---------------------------------------------------------------- ai coach */

export type CoachRun<T> = {
  data: T;
  runId: string;
  model: string | null;
  generatedAt: Iso;
};

export type AiRunRow = {
  id: string;
  agent: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
  model: string | null;
  createdAt: Iso;
  output: unknown;
};

/**
 * `getDailyObservation` / `getWeeklyReview` read the most recent successful
 * salesCoach run back out of the AiRun table. There is no endpoint for that
 * pair, but `/api/ai/runs` exposes the same rows, so the "which of the two
 * shapes is this?" test the source did with a Zod schema is done here with a
 * structural check on the parsed output.
 */
export function latestCoachRun<T>(
  runs: AiRunRow[] | null | undefined,
  matches: (output: Record<string, unknown>) => boolean,
  since: Date,
): CoachRun<T> | null {
  for (const run of runs ?? []) {
    if (run.agent !== "salesCoach" || run.status !== "SUCCESS") continue;
    if (new Date(run.createdAt).getTime() < since.getTime()) continue;
    const output = run.output;
    if (!output || typeof output !== "object" || Array.isArray(output)) continue;
    if (!matches(output as Record<string, unknown>)) continue;
    return {
      data: output as T,
      runId: run.id,
      model: run.model,
      generatedAt: run.createdAt,
    };
  }
  return null;
}

export function isDailyPlan(output: Record<string, unknown>): boolean {
  return (
    typeof output.headline === "string" &&
    Array.isArray(output.priorities) &&
    Array.isArray(output.goal_status) &&
    Array.isArray(output.risks)
  );
}

export function isWeeklyReview(output: Record<string, unknown>): boolean {
  return (
    Array.isArray(output.what_worked) &&
    Array.isArray(output.what_did_not_work) &&
    typeof output.best_icp === "string" &&
    Array.isArray(output.changes_for_next_week)
  );
}

export type DailyPlanRun = CoachRun<SalesCoachOutput>;
export type WeeklyReviewRun = CoachRun<WeeklyReviewOutput>;

/* ----------------------------------------------------------------- actions */

/**
 * `generateDailyPlanAction` — `src/components/dashboard/actions.ts`.
 * `POST /api/ai { agent: "salesCoach" }` runs the same agent against the same
 * schema and records the same AiRun row, so the dashboard reads the result back
 * exactly as it did in Next. `revalidatePath("/")` becomes the caller's
 * `refresh()`.
 */
export function generateDailyPlan() {
  return $fetch("/api/ai", { method: "POST", body: { agent: "salesCoach" } });
}

/**
 * `generateWeeklyReviewAction`.
 *
 * GAP: nothing in §4 runs `generateWeeklyReview`. `/api/ai` is the right
 * endpoint and the right shape, but it only dispatches `research`,
 * `salesCoach` and the lead agents, so this returns
 * `400 Unsupported agent "weeklyReview"` until that dispatch table gains a
 * `weeklyReview` branch. The button surfaces the server's own message.
 */
export function generateWeeklyReview() {
  return $fetch("/api/ai", { method: "POST", body: { agent: "weeklyReview" } });
}

/** `snapshotGoalsAction` — covered by §4. */
export function snapshotGoals() {
  return $fetch("/api/goals/snapshot", { method: "POST" });
}

/** Pulls the server's message out of a FetchError, per §5.3. */
export function errorMessage(e: unknown, fallback = "Something went wrong") {
  const err = e as { data?: { error?: string } };
  return err?.data?.error ?? fallback;
}
