import { describe, expect, it } from "vitest";
import {
  STALE_AFTER_DAYS,
  addDays,
  classifyFollowUp,
  describeFollowUp,
  suggestFollowUpDate,
  type FollowUpLead,
} from "./followups";

const now = new Date("2026-08-07T12:00:00Z");

function lead(overrides: Partial<FollowUpLead> = {}): FollowUpLead {
  return {
    stage: "CONTACTED",
    nextAction: "Follow up on the last message",
    nextActionDueAt: addDays(now, 3),
    lastActivityAt: addDays(now, -1),
    ...overrides,
  };
}

describe("classifyFollowUp", () => {
  it("is quiet when a dated action is still in the future", () => {
    const result = classifyFollowUp(lead(), now);
    expect(result.status).toBe("SCHEDULED");
    expect(result.flags).toEqual([]);
    expect(result.urgency).toBe(0);
  });

  it("flags a lead with no next action", () => {
    const result = classifyFollowUp(
      lead({ nextAction: null, nextActionDueAt: null }),
      now,
    );
    expect(result.status).toBe("NO_NEXT_ACTION");
    expect(result.flags).toContain("NO_NEXT_ACTION");
  });

  it("treats a blank next action as no next action", () => {
    expect(
      classifyFollowUp(lead({ nextAction: "   ", nextActionDueAt: null }), now)
        .status,
    ).toBe("NO_NEXT_ACTION");
  });

  it("flags an overdue action and counts the days", () => {
    const result = classifyFollowUp(
      lead({ nextActionDueAt: addDays(now, -5) }),
      now,
    );
    expect(result.status).toBe("OVERDUE");
    expect(result.daysOverdue).toBe(5);
    expect(result.flags).toContain("OVERDUE");
  });

  it("separates due today from overdue", () => {
    const result = classifyFollowUp(
      lead({ nextActionDueAt: new Date("2026-08-07T08:00:00Z") }),
      now,
    );
    expect(result.status).toBe("DUE_TODAY");
    expect(result.daysOverdue).toBe(0);
    expect(result.flags).toEqual([]);
  });

  it("flags a stale lead when nothing has happened for two weeks", () => {
    const result = classifyFollowUp(
      lead({ lastActivityAt: addDays(now, -STALE_AFTER_DAYS) }),
      now,
    );
    expect(result.flags).toContain("STALE");
    expect(result.daysSinceActivity).toBe(STALE_AFTER_DAYS);
  });

  it("does not flag staleness one day early", () => {
    const result = classifyFollowUp(
      lead({ lastActivityAt: addDays(now, -(STALE_AFTER_DAYS - 1)) }),
      now,
    );
    expect(result.flags).not.toContain("STALE");
  });

  it("reports overdue as the status but still carries the stale flag", () => {
    const result = classifyFollowUp(
      lead({ nextActionDueAt: addDays(now, -2), lastActivityAt: addDays(now, -30) }),
      now,
    );
    expect(result.status).toBe("OVERDUE");
    expect(result.flags).toEqual(["OVERDUE", "STALE"]);
  });

  it("falls back to lastContactedAt then createdAt for staleness", () => {
    expect(
      classifyFollowUp(
        lead({ lastActivityAt: null, lastContactedAt: addDays(now, -20) }),
        now,
      ).daysSinceActivity,
    ).toBe(20);
    expect(
      classifyFollowUp(
        lead({
          lastActivityAt: null,
          lastContactedAt: null,
          createdAt: addDays(now, -40),
        }),
        now,
      ).daysSinceActivity,
    ).toBe(40);
  });

  it("accepts ISO strings as well as Date objects", () => {
    const result = classifyFollowUp(
      lead({ nextActionDueAt: addDays(now, -3).toISOString() }),
      now,
    );
    expect(result.status).toBe("OVERDUE");
  });

  for (const stage of ["WON", "LOST", "CUSTOMER", "NOT_A_FIT", "DO_NOT_CONTACT"] as const) {
    it(`asks for nothing on a ${stage} lead`, () => {
      const result = classifyFollowUp(
        { stage, nextAction: null, nextActionDueAt: null, lastActivityAt: addDays(now, -90) },
        now,
      );
      expect(result.status).toBe("NOT_APPLICABLE");
      expect(result.flags).toEqual([]);
    });
  }

  it("sorts the daily queue: overdue, then no action, then due today, then stale", () => {
    const overdue = classifyFollowUp(lead({ nextActionDueAt: addDays(now, -1) }), now);
    const none = classifyFollowUp(lead({ nextAction: null, nextActionDueAt: null }), now);
    const today = classifyFollowUp(lead({ nextActionDueAt: now }), now);
    const stale = classifyFollowUp(
      lead({ lastActivityAt: addDays(now, -40) }),
      now,
    );
    expect(overdue.urgency).toBeGreaterThan(none.urgency);
    expect(none.urgency).toBeGreaterThan(today.urgency);
    expect(today.urgency).toBeGreaterThan(stale.urgency);
  });
});

describe("suggestFollowUpDate", () => {
  it("moves fast on an interested reply", () => {
    expect(suggestFollowUpDate({ intent: "INTERESTED" }, now)).toEqual(
      addDays(now, 2),
    );
  });

  it("pushes a not-now reply out a quarter", () => {
    expect(suggestFollowUpDate({ intent: "NOT_NOW" }, now)).toEqual(
      addDays(now, 90),
    );
  });

  it("never schedules a follow-up after a hard no or an opt-out", () => {
    expect(suggestFollowUpDate({ intent: "NOT_INTERESTED" }, now)).toBeNull();
    expect(suggestFollowUpDate({ intent: "UNSUBSCRIBE" }, now)).toBeNull();
  });

  it("prefers the model's suggestion when it is sane", () => {
    expect(
      suggestFollowUpDate({ intent: "INTERESTED", suggestedDays: 5 }, now),
    ).toEqual(addDays(now, 5));
  });

  it("ignores a nonsensical suggestion", () => {
    expect(
      suggestFollowUpDate({ intent: "INTERESTED", suggestedDays: -3 }, now),
    ).toEqual(addDays(now, 2));
    expect(
      suggestFollowUpDate({ intent: "INTERESTED", suggestedDays: 9000 }, now),
    ).toEqual(addDays(now, 2));
  });

  it("backs off further with each unanswered message and then stops", () => {
    expect(suggestFollowUpDate({ unansweredCount: 0 }, now)).toEqual(addDays(now, 4));
    expect(suggestFollowUpDate({ unansweredCount: 1 }, now)).toEqual(addDays(now, 6));
    expect(suggestFollowUpDate({ unansweredCount: 2 }, now)).toEqual(addDays(now, 10));
    expect(suggestFollowUpDate({ unansweredCount: 3 }, now)).toEqual(addDays(now, 20));
    expect(suggestFollowUpDate({ unansweredCount: 4 }, now)).toBeNull();
  });
});

describe("describeFollowUp", () => {
  it("names a concrete action per intent", () => {
    expect(describeFollowUp({ intent: "INTERESTED" })).toMatch(/call/i);
    expect(describeFollowUp({ intent: "NEEDS_INFO" })).toMatch(/questions/i);
    expect(describeFollowUp({ intent: "OUT_OF_OFFICE" })).toMatch(/leave/i);
    expect(describeFollowUp({})).toMatch(/follow up/i);
  });
});
