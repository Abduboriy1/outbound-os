import { describe, expect, it } from "vitest";
import {
  formatPeriodRange,
  hasRolledOver,
  periodElapsedFraction,
  periodRange,
  previousPeriodRange,
} from "./periods";

const wedMidday = new Date("2026-08-05T12:00:00.000Z"); // a Wednesday

describe("periodRange", () => {
  it("returns the UTC calendar day for DAILY", () => {
    const range = periodRange("DAILY", wedMidday);
    expect(range.start.toISOString()).toBe("2026-08-05T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-08-06T00:00:00.000Z");
  });

  it("starts the week on Monday", () => {
    const range = periodRange("WEEKLY", wedMidday);
    expect(range.start.toISOString()).toBe("2026-08-03T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });

  it("keeps Sunday in the week that started the previous Monday", () => {
    const sunday = new Date("2026-08-09T23:59:59.000Z");
    expect(periodRange("WEEKLY", sunday).start.toISOString()).toBe(
      "2026-08-03T00:00:00.000Z",
    );
  });

  it("returns whole calendar months", () => {
    const range = periodRange("MONTHLY", wedMidday);
    expect(range.start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("rolls a December month into the next year", () => {
    const range = periodRange("MONTHLY", new Date("2026-12-20T00:00:00.000Z"));
    expect(range.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("returns calendar quarters", () => {
    expect(periodRange("QUARTERLY", wedMidday).start.toISOString()).toBe(
      "2026-07-01T00:00:00.000Z",
    );
    expect(periodRange("QUARTERLY", wedMidday).end.toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    );
  });
});

describe("previousPeriodRange", () => {
  it("steps back one week", () => {
    const range = previousPeriodRange("WEEKLY", wedMidday);
    expect(range.start.toISOString()).toBe("2026-07-27T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-08-03T00:00:00.000Z");
  });

  it("steps back a variable-length month", () => {
    const range = previousPeriodRange("MONTHLY", new Date("2026-03-15T00:00:00.000Z"));
    expect(range.start.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("hasRolledOver", () => {
  it("is false inside the same window", () => {
    const start = periodRange("WEEKLY", wedMidday).start;
    expect(hasRolledOver(start, "WEEKLY", wedMidday)).toBe(false);
  });

  it("is true once the next window opens", () => {
    const start = periodRange("WEEKLY", wedMidday).start;
    expect(hasRolledOver(start, "WEEKLY", new Date("2026-08-10T00:00:00.000Z"))).toBe(
      true,
    );
  });
});

describe("periodElapsedFraction", () => {
  it("reports how far through the window we are", () => {
    const range = periodRange("DAILY", wedMidday);
    expect(periodElapsedFraction(range, wedMidday)).toBeCloseTo(0.5, 5);
  });

  it("clamps outside the window", () => {
    const range = periodRange("DAILY", wedMidday);
    expect(periodElapsedFraction(range, new Date("2026-08-01T00:00:00Z"))).toBe(0);
    expect(periodElapsedFraction(range, new Date("2026-08-20T00:00:00Z"))).toBe(1);
  });
});

describe("formatPeriodRange", () => {
  it("names the inclusive last day, not the exclusive end", () => {
    expect(formatPeriodRange(periodRange("WEEKLY", wedMidday))).toBe("Aug 3 – Aug 9");
  });
});
