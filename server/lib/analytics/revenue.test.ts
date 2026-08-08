import { describe, expect, it } from "vitest";
import type { LeadStage } from "~~/server/generated/prisma/client";
import { STAGE_WIN_PROBABILITY } from "~~/shared/stages";
import { computeRevenue, isOpenPipeline, leadValue, type RevenueRow } from "./revenue";

function row(over: Partial<RevenueRow> & { stage: LeadStage }): RevenueRow {
  return {
    estimatedValueMin: null,
    estimatedValueMax: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    wonAt: null,
    lostAt: null,
    ...over,
  };
}

describe("leadValue", () => {
  it("takes the midpoint of a range", () => {
    expect(leadValue({ estimatedValueMin: 10_000, estimatedValueMax: 30_000 })).toBe(
      20_000,
    );
  });

  it("falls back to whichever bound is known", () => {
    expect(leadValue({ estimatedValueMin: 8_000, estimatedValueMax: null })).toBe(8_000);
    expect(leadValue({ estimatedValueMin: null, estimatedValueMax: 9_000 })).toBe(9_000);
  });

  it("is zero when nothing is estimated", () => {
    expect(leadValue({ estimatedValueMin: null, estimatedValueMax: null })).toBe(0);
  });
});

describe("isOpenPipeline", () => {
  it("includes forward stages", () => {
    expect(isOpenPipeline(row({ stage: "DISCOVERY" }))).toBe(true);
  });

  it("excludes closed and off-pipeline stages", () => {
    expect(isOpenPipeline(row({ stage: "WON" }))).toBe(false);
    expect(isOpenPipeline(row({ stage: "CUSTOMER" }))).toBe(false);
    expect(isOpenPipeline(row({ stage: "LOST" }))).toBe(false);
    expect(isOpenPipeline(row({ stage: "NOT_A_FIT" }))).toBe(false);
  });

  it("excludes a lead already marked won or lost regardless of stage", () => {
    expect(
      isOpenPipeline(row({ stage: "DISCOVERY", lostAt: new Date("2026-02-01Z") })),
    ).toBe(false);
  });
});

describe("computeRevenue", () => {
  const rows: RevenueRow[] = [
    row({ stage: "DISCOVERY", estimatedValueMin: 10_000, estimatedValueMax: 20_000 }),
    row({ stage: "PROPOSAL_SENT", estimatedValueMin: 40_000, estimatedValueMax: 40_000 }),
    row({ stage: "PROSPECT", estimatedValueMin: 5_000, estimatedValueMax: 5_000 }),
    row({
      stage: "WON",
      estimatedValueMin: 25_000,
      estimatedValueMax: 35_000,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      wonAt: new Date("2026-02-10T00:00:00Z"),
    }),
    row({
      stage: "LOST",
      estimatedValueMin: 12_000,
      estimatedValueMax: 12_000,
      lostAt: new Date("2026-02-01T00:00:00Z"),
    }),
  ];

  it("sums the open pipeline only", () => {
    const result = computeRevenue(rows);
    expect(result.openCount).toBe(3);
    expect(result.pipelineValue).toBe(15_000 + 40_000 + 5_000);
  });

  it("discounts the pipeline by stage win probability", () => {
    const result = computeRevenue(rows);
    const expected =
      15_000 * STAGE_WIN_PROBABILITY.DISCOVERY! +
      40_000 * STAGE_WIN_PROBABILITY.PROPOSAL_SENT! +
      5_000 * (STAGE_WIN_PROBABILITY.PROSPECT ?? 0);
    expect(result.weightedPipeline).toBe(Math.round(expected));
    expect(result.weightedPipeline).toBeLessThan(result.pipelineValue);
  });

  it("separates won and lost revenue", () => {
    const result = computeRevenue(rows);
    expect(result.wonCount).toBe(1);
    expect(result.wonRevenue).toBe(30_000);
    expect(result.lostCount).toBe(1);
    expect(result.lostRevenue).toBe(12_000);
  });

  it("averages won deals", () => {
    expect(computeRevenue(rows).averageDealSize).toBe(30_000);
  });

  it("measures the sales cycle from creation to win", () => {
    expect(computeRevenue(rows).averageSalesCycleDays).toBe(40);
  });

  it("computes win rate over closed deals only", () => {
    expect(computeRevenue(rows).winRate).toBe(50);
  });

  it("returns nulls rather than NaN when nothing has closed", () => {
    const result = computeRevenue([row({ stage: "PROSPECT" })]);
    expect(result.averageDealSize).toBeNull();
    expect(result.averageSalesCycleDays).toBeNull();
    expect(result.winRate).toBe(0);
  });

  it("handles an empty dataset", () => {
    const result = computeRevenue([]);
    expect(result.pipelineValue).toBe(0);
    expect(result.weightedPipeline).toBe(0);
  });
});
