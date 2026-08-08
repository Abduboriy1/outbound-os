import { describe, expect, it } from "vitest";
import type { LeadStage } from "~~/server/generated/prisma/client";
import { breakdownBy, companySizeBand, summarisePerformance } from "./breakdown";
import { computeAcquisition } from "./acquisition";
import type { AnalyticsLeadRow } from "./types";

function lead(over: Partial<AnalyticsLeadRow> & { stage: LeadStage }): AnalyticsLeadRow {
  return {
    id: Math.random().toString(36).slice(2),
    reachedStages: [],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    wonAt: null,
    lostAt: null,
    lostReason: null,
    estimatedValueMin: null,
    estimatedValueMax: null,
    sourceType: "MANUAL",
    researched: false,
    icpName: null,
    industry: null,
    employeeCount: null,
    problems: [],
    ...over,
  };
}

const dataset: AnalyticsLeadRow[] = [
  lead({
    stage: "WON",
    industry: "Logistics",
    icpName: "Logistics Automation",
    employeeCount: 120,
    sourceType: "CSV",
    researched: true,
    problems: ["Manual reporting", "Spreadsheets"],
    reachedStages: ["QUALIFIED", "CONTACTED", "RESPONDED", "DISCOVERY", "PROPOSAL_SENT", "WON"],
    wonAt: new Date("2026-03-01T00:00:00Z"),
    estimatedValueMin: 30_000,
    estimatedValueMax: 30_000,
  }),
  lead({
    stage: "CONTACTED",
    industry: "Logistics",
    icpName: "Logistics Automation",
    employeeCount: 40,
    sourceType: "CSV",
    researched: true,
    problems: ["Spreadsheets"],
    reachedStages: ["QUALIFIED", "CONTACTED"],
  }),
  lead({
    stage: "PROSPECT",
    industry: "Manufacturing",
    employeeCount: 5,
    sourceType: "WEBSITE_FORM",
    researched: false,
    problems: [],
  }),
];

describe("summarisePerformance", () => {
  it("counts each funnel milestone", () => {
    const summary = summarisePerformance(dataset);
    expect(summary).toMatchObject({
      leads: 3,
      qualified: 2,
      contacted: 2,
      replied: 1,
      discovery: 1,
      proposals: 1,
      won: 1,
      wonRevenue: 30_000,
    });
  });

  it("measures reply rate against contacted leads", () => {
    expect(summarisePerformance(dataset).replyRate).toBe(50);
  });

  it("measures win rate against all leads in the slice", () => {
    expect(summarisePerformance(dataset).winRate).toBe(33.3);
  });
});

describe("breakdownBy", () => {
  it("groups by a single-valued dimension", () => {
    const buckets = breakdownBy(dataset, (r) => r.industry);
    expect(buckets.map((b) => [b.key, b.leads])).toEqual([
      ["Logistics", 2],
      ["Manufacturing", 1],
    ]);
  });

  it("puts missing values in the fallback bucket", () => {
    const buckets = breakdownBy(dataset, (r) => r.icpName);
    expect(buckets.find((b) => b.key === "Unknown")?.leads).toBe(1);
  });

  it("lets a row contribute to several buckets for multi-valued dimensions", () => {
    const buckets = breakdownBy(dataset, (r) => r.problems, "No problem identified");
    const keys = Object.fromEntries(buckets.map((b) => [b.key, b.leads]));
    expect(keys["Spreadsheets"]).toBe(2);
    expect(keys["Manual reporting"]).toBe(1);
    expect(keys["No problem identified"]).toBe(1);
  });

  it("does not double count a repeated key on one row", () => {
    const buckets = breakdownBy(
      [lead({ stage: "PROSPECT", problems: ["Spreadsheets", "Spreadsheets"] })],
      (r) => r.problems,
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0].leads).toBe(1);
  });

  it("sorts by won revenue then lead volume", () => {
    const buckets = breakdownBy(dataset, (r) => r.industry);
    expect(buckets[0].key).toBe("Logistics");
  });
});

describe("companySizeBand", () => {
  it("bands employee counts", () => {
    expect(companySizeBand(3)).toBe("1-9");
    expect(companySizeBand(40)).toBe("10-49");
    expect(companySizeBand(120)).toBe("50-199");
    expect(companySizeBand(300)).toBe("200-499");
    expect(companySizeBand(800)).toBe("500-999");
    expect(companySizeBand(5000)).toBe("1000+");
  });

  it("bands an unknown headcount", () => {
    expect(companySizeBand(null)).toBe("Unknown");
  });
});

describe("computeAcquisition", () => {
  it("counts discovered, researched and qualified leads", () => {
    const result = computeAcquisition(dataset);
    expect(result.discovered).toBe(3);
    expect(result.researched).toBe(2);
    expect(result.qualified).toBe(2);
    expect(result.qualifiedRate).toBe(66.7);
  });

  it("breaks the same numbers down by source, busiest first", () => {
    const result = computeAcquisition(dataset);
    expect(result.bySource[0]).toMatchObject({
      source: "CSV",
      leads: 2,
      qualified: 2,
      qualifiedRate: 100,
    });
    expect(result.bySource[1].source).toBe("WEBSITE_FORM");
  });

  it("handles no leads at all", () => {
    expect(computeAcquisition([])).toMatchObject({
      discovered: 0,
      qualifiedRate: 0,
      bySource: [],
    });
  });
});
