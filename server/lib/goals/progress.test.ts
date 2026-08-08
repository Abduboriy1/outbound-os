import { describe, expect, it } from "vitest";
import { computeAllGoalProgress, computeGoalProgress, type GoalEvent } from "./progress";

const now = new Date("2026-08-05T12:00:00.000Z"); // Wednesday midday

function event(metric: GoalEvent["metric"], iso: string, count?: number): GoalEvent {
  return { metric, at: new Date(iso), count };
}

describe("computeGoalProgress", () => {
  it("counts only events for the requested metric inside the window", () => {
    const events = [
      event("OUTREACH_SENT", "2026-08-03T09:00:00Z"),
      event("OUTREACH_SENT", "2026-08-04T09:00:00Z"),
      event("REPLIES", "2026-08-04T10:00:00Z"),
      event("OUTREACH_SENT", "2026-07-31T09:00:00Z"), // previous week
    ];
    const result = computeGoalProgress(events, "WEEKLY", now, {
      metric: "OUTREACH_SENT",
      target: 30,
    });
    expect(result.value).toBe(2);
    expect(result.target).toBe(30);
  });

  it("treats the window as half-open so boundary events land in one period only", () => {
    const events = [
      event("OUTREACH_SENT", "2026-08-03T00:00:00.000Z"), // exact start: counted
      event("OUTREACH_SENT", "2026-08-10T00:00:00.000Z"), // exact end: excluded
    ];
    expect(
      computeGoalProgress(events, "WEEKLY", now, { metric: "OUTREACH_SENT" }).value,
    ).toBe(1);
  });

  it("honours an explicit count for batched events", () => {
    const events = [event("CONTACTS_IDENTIFIED", "2026-08-04T09:00:00Z", 12)];
    expect(
      computeGoalProgress(events, "WEEKLY", now, { metric: "CONTACTS_IDENTIFIED" })
        .value,
    ).toBe(12);
  });

  it("counts every event when no metric filter is given", () => {
    const events = [
      event("OUTREACH_SENT", "2026-08-04T09:00:00Z"),
      event("REPLIES", "2026-08-04T10:00:00Z"),
    ];
    expect(computeGoalProgress(events, "WEEKLY", now).value).toBe(2);
  });

  it("caps percent at 100 when the target is beaten", () => {
    const events = Array.from({ length: 40 }, (_, i) =>
      event("OUTREACH_SENT", `2026-08-04T${String(i % 24).padStart(2, "0")}:00:00Z`),
    );
    const result = computeGoalProgress(events, "WEEKLY", now, {
      metric: "OUTREACH_SENT",
      target: 30,
    });
    expect(result.value).toBe(40);
    expect(result.percent).toBe(100);
  });

  it("reports zero percent rather than dividing by a zero target", () => {
    const result = computeGoalProgress([], "WEEKLY", now, { target: 0 });
    expect(result.percent).toBe(0);
    expect(result.expectedByNow).toBe(0);
    expect(result.onPace).toBe(true);
  });

  it("prorates the target against elapsed time to judge pace", () => {
    // Wednesday midday is 2.5 of 7 days into the week: 30 * 2.5/7 = 10.7 -> 11.
    const events = Array.from({ length: 6 }, (_, i) =>
      event("OUTREACH_SENT", `2026-08-03T0${i}:00:00Z`),
    );
    const result = computeGoalProgress(events, "WEEKLY", now, {
      metric: "OUTREACH_SENT",
      target: 30,
    });
    expect(result.expectedByNow).toBe(11);
    expect(result.pace).toBe(-5);
    expect(result.onPace).toBe(false);
  });

  it("is on pace when ahead of the prorated target", () => {
    const events = Array.from({ length: 20 }, (_, i) =>
      event("COMPANIES_RESEARCHED", `2026-08-03T${String(i).padStart(2, "0")}:00:00Z`),
    );
    const result = computeGoalProgress(events, "WEEKLY", now, {
      metric: "COMPANIES_RESEARCHED",
      target: 30,
    });
    expect(result.onPace).toBe(true);
    expect(result.pace).toBe(9);
  });

  it("exposes the window it measured", () => {
    const result = computeGoalProgress([], "WEEKLY", now, { target: 5 });
    expect(result.periodStart.toISOString()).toBe("2026-08-03T00:00:00.000Z");
    expect(result.periodEnd.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(result.elapsedPercent).toBe(36);
  });

  it("measures a daily goal against the current day only", () => {
    const events = [
      event("OUTREACH_SENT", "2026-08-05T08:00:00Z"),
      event("OUTREACH_SENT", "2026-08-04T08:00:00Z"),
    ];
    expect(
      computeGoalProgress(events, "DAILY", now, { metric: "OUTREACH_SENT" }).value,
    ).toBe(1);
  });
});

describe("computeAllGoalProgress", () => {
  it("computes every goal from a single event list", () => {
    const events = [
      event("OUTREACH_SENT", "2026-08-04T09:00:00Z"),
      event("OUTREACH_SENT", "2026-08-05T09:00:00Z"),
      event("DISCOVERY_CALLS", "2026-08-05T09:00:00Z"),
    ];
    const result = computeAllGoalProgress(
      [
        { id: "a", metric: "OUTREACH_SENT", period: "WEEKLY", target: 30 },
        { id: "b", metric: "DISCOVERY_CALLS", period: "WEEKLY", target: 3 },
        { id: "c", metric: "DEALS_WON", period: "MONTHLY", target: 1 },
      ],
      events,
      now,
    );
    expect(result.map((g) => g.progress.value)).toEqual([2, 1, 0]);
    expect(result[2].progress.periodStart.toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });
});
