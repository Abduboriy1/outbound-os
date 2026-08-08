/**
 * `getDailyObservation` / `getWeeklyReview` used a Zod schema to tell a daily
 * plan from a weekly review, because both are recorded under the same
 * `salesCoach` agent name. `/api/ai/runs` hands back the same rows without that
 * discrimination, so `latestCoachRun` reproduces it here — these tests pin the
 * three rules the source relied on: right agent, right shape, inside the window.
 */
import { describe, expect, it } from "vitest";
import {
  errorMessage,
  isDailyPlan,
  isWeeklyReview,
  latestCoachRun,
  unwrap,
  type AiRunRow,
} from "./api";

const DAILY = {
  headline: "Chase the three live replies",
  priorities: [{ rank: 1, action: "Reply to Acme", reason: "Two days cold", lead_id: "l1" }],
  pipeline_observation: "Reply rate is 8%",
  goal_status: [],
  risks: [],
};

const WEEKLY = {
  what_worked: ["Short subject lines"],
  what_did_not_work: [],
  best_icp: "Mid-market logistics",
  responsive_industries: ["Logistics"],
  messages_that_produced_replies: [],
  where_deals_stalled: "Discovery",
  most_common_objection: "Budget",
  changes_for_next_week: ["Send follow-ups on day three"],
};

function run(over: Partial<AiRunRow>): AiRunRow {
  return {
    id: "r1",
    agent: "salesCoach",
    status: "SUCCESS",
    model: "claude",
    createdAt: "2026-08-07T09:00:00.000Z",
    output: DAILY,
    ...over,
  };
}

const SINCE = new Date("2026-08-06T09:00:00.000Z");

describe("unwrap", () => {
  it("flattens the { data } envelope every endpoint uses", () => {
    expect(unwrap({ data: { total: 3 } })).toEqual({ total: 3 });
  });
});

describe("isDailyPlan / isWeeklyReview", () => {
  it("tells the two salesCoach outputs apart", () => {
    expect(isDailyPlan(DAILY)).toBe(true);
    expect(isDailyPlan(WEEKLY)).toBe(false);
    expect(isWeeklyReview(WEEKLY)).toBe(true);
    expect(isWeeklyReview(DAILY)).toBe(false);
  });

  it("rejects a malformed row rather than rendering half a plan", () => {
    expect(isDailyPlan({ headline: "x" })).toBe(false);
    expect(isWeeklyReview({ what_worked: [] })).toBe(false);
  });
});

describe("latestCoachRun", () => {
  it("returns the newest matching run in the order it was given", () => {
    const found = latestCoachRun(
      [run({ id: "new" }), run({ id: "old", createdAt: "2026-08-07T08:00:00.000Z" })],
      isDailyPlan,
      SINCE,
    );
    expect(found?.runId).toBe("new");
    expect(found?.model).toBe("claude");
    expect(found?.generatedAt).toBe("2026-08-07T09:00:00.000Z");
  });

  it("skips a row whose output is the other shape", () => {
    expect(latestCoachRun([run({ output: WEEKLY })], isDailyPlan, SINCE)).toBeNull();
    expect(latestCoachRun([run({ output: WEEKLY })], isWeeklyReview, SINCE)?.runId).toBe(
      "r1",
    );
  });

  it("skips a run from another agent or a failed run", () => {
    expect(latestCoachRun([run({ agent: "research" })], isDailyPlan, SINCE)).toBeNull();
    expect(latestCoachRun([run({ status: "FAILED" })], isDailyPlan, SINCE)).toBeNull();
  });

  it("skips a run older than the window", () => {
    expect(
      latestCoachRun([run({ createdAt: "2026-08-01T09:00:00.000Z" })], isDailyPlan, SINCE),
    ).toBeNull();
  });

  it("skips a non-object output and tolerates no rows at all", () => {
    expect(latestCoachRun([run({ output: null })], isDailyPlan, SINCE)).toBeNull();
    expect(latestCoachRun([run({ output: [] })], isDailyPlan, SINCE)).toBeNull();
    expect(latestCoachRun(null, isDailyPlan, SINCE)).toBeNull();
    expect(latestCoachRun([], isDailyPlan, SINCE)).toBeNull();
  });
});

describe("errorMessage", () => {
  it("prefers the server's own message", () => {
    expect(errorMessage({ data: { error: "Validation failed" } })).toBe(
      "Validation failed",
    );
  });

  it("falls back when there is nothing to read", () => {
    expect(errorMessage(new Error("boom"))).toBe("Something went wrong");
    expect(errorMessage(undefined, "Could not save")).toBe("Could not save");
  });
});
