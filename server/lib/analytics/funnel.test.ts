import { describe, expect, it } from "vitest";
import type { LeadStage } from "~~/server/generated/prisma/client";
import {
  computeFunnel,
  peakRank,
  rate,
  reachedStep,
  stageRank,
  weakestTransition,
} from "./funnel";

function lead(stage: LeadStage, reachedStages: LeadStage[] = []) {
  return { stage, reachedStages };
}

describe("stageRank", () => {
  it("orders the forward pipeline", () => {
    expect(stageRank("PROSPECT")).toBeLessThan(stageRank("QUALIFIED"));
    expect(stageRank("QUALIFIED")).toBeLessThan(stageRank("WON"));
  });

  it("gives off-pipeline stages no rank", () => {
    expect(stageRank("LOST")).toBe(-1);
    expect(stageRank("NOT_A_FIT")).toBe(-1);
  });
});

describe("peakRank", () => {
  it("uses history when the current stage is off-pipeline", () => {
    expect(peakRank(lead("LOST", ["QUALIFIED", "CONTACTED", "PROPOSAL_SENT"]))).toBe(
      stageRank("PROPOSAL_SENT"),
    );
  });

  it("uses the current stage when it is further than history", () => {
    expect(peakRank(lead("DISCOVERY", ["QUALIFIED"]))).toBe(stageRank("DISCOVERY"));
  });
});

describe("reachedStep", () => {
  it("counts every lead for the top of the funnel", () => {
    expect(reachedStep(lead("PROSPECT"), null)).toBe(true);
    expect(reachedStep(lead("NOT_A_FIT"), null)).toBe(true);
  });

  it("counts a later stage as having passed an earlier one", () => {
    expect(reachedStep(lead("PROPOSAL_SENT"), "CONTACTED")).toBe(true);
  });

  it("does not count a lead that never got there", () => {
    expect(reachedStep(lead("RESEARCHING"), "QUALIFIED")).toBe(false);
  });

  it("counts CUSTOMER as won", () => {
    expect(reachedStep(lead("CUSTOMER"), "WON")).toBe(true);
  });

  it("counts a lost deal for every step it passed through", () => {
    const lost = lead("LOST", ["QUALIFIED", "CONTACTED", "RESPONDED", "DISCOVERY"]);
    expect(reachedStep(lost, "DISCOVERY")).toBe(true);
    expect(reachedStep(lost, "PROPOSAL_SENT")).toBe(false);
  });
});

describe("computeFunnel", () => {
  const rows = [
    lead("PROSPECT"),
    lead("RESEARCHING"),
    lead("NOT_A_FIT"),
    lead("QUALIFIED", ["QUALIFIED"]),
    lead("CONTACTED", ["QUALIFIED", "CONTACTED"]),
    lead("RESPONDED", ["QUALIFIED", "CONTACTED", "RESPONDED"]),
    lead("DISCOVERY", ["QUALIFIED", "CONTACTED", "RESPONDED", "DISCOVERY"]),
    lead("LOST", ["QUALIFIED", "CONTACTED", "RESPONDED", "DISCOVERY", "PROPOSAL_SENT"]),
    lead("WON", ["QUALIFIED", "CONTACTED", "RESPONDED", "DISCOVERY", "PROPOSAL_SENT", "WON"]),
  ];

  it("counts each step cumulatively", () => {
    const funnel = computeFunnel(rows);
    expect(funnel.map((s) => [s.key, s.count])).toEqual([
      ["LEAD", 9],
      ["QUALIFIED", 6],
      ["CONTACTED", 5],
      ["REPLY", 4],
      ["DISCOVERY", 3],
      ["PROPOSAL", 2],
      ["WON", 1],
    ]);
  });

  it("computes step-to-step conversion", () => {
    const funnel = computeFunnel(rows);
    expect(funnel[0].conversionFromPrevious).toBeNull();
    expect(funnel[1].conversionFromPrevious).toBe(66.7);
    expect(funnel[2].conversionFromPrevious).toBe(83.3);
    expect(funnel[6].conversionFromPrevious).toBe(50);
  });

  it("computes conversion from the top of the funnel", () => {
    const funnel = computeFunnel(rows);
    expect(funnel[0].conversionFromLead).toBe(100);
    expect(funnel[6].conversionFromLead).toBe(11.1);
  });

  it("returns zeros rather than NaN for an empty pipeline", () => {
    const funnel = computeFunnel([]);
    expect(funnel.every((s) => s.count === 0 && s.conversionFromLead === 0)).toBe(true);
  });
});

describe("weakestTransition", () => {
  it("finds the worst hand-off", () => {
    // Replies convert to discovery at 20%, the weakest step in this pipeline.
    const contacted: LeadStage[] = ["QUALIFIED", "CONTACTED"];
    const replied: LeadStage[] = [...contacted, "RESPONDED"];
    const funnel = computeFunnel([
      ...Array.from({ length: 4 }, () => lead("RESPONDED", replied)),
      lead("WON", [...replied, "DISCOVERY", "PROPOSAL_SENT", "WON"]),
    ]);
    expect(funnel.find((s) => s.key === "DISCOVERY")?.conversionFromPrevious).toBe(20);
    expect(weakestTransition(funnel)?.key).toBe("DISCOVERY");
  });

  it("returns null with no steps to compare", () => {
    expect(weakestTransition([])).toBeNull();
  });
});

describe("rate", () => {
  it("returns 0 for a zero denominator", () => {
    expect(rate(3, 0)).toBe(0);
  });

  it("rounds to one decimal place", () => {
    expect(rate(1, 3)).toBe(33.3);
  });
});
