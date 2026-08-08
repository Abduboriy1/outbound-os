import { describe, expect, it } from "vitest";
import { computeRoi } from "./roi";

describe("computeRoi", () => {
  // The worked example from plan §25.
  const planExample = { employees: 3, hoursPerWeek: 8, hourlyCost: 35 };

  it("reproduces the worked example from the plan", () => {
    const result = computeRoi(planExample);
    expect(result.weeklyHours).toBe(24);
    expect(result.weeklyCost).toBe(840);
    expect(result.annualCost).toBe(43_680);
  });

  it("annualises hours as well as cost", () => {
    expect(computeRoi(planExample).annualHours).toBe(1_248);
  });

  it("treats savings as the full manual cost unless told otherwise", () => {
    const result = computeRoi(planExample);
    expect(result.savingsRate).toBe(1);
    expect(result.annualSavings).toBe(43_680);
  });

  it("scales savings by the stated automation share", () => {
    const result = computeRoi({ ...planExample, savingsRate: 0.75 });
    expect(result.annualSavings).toBe(32_760);
    expect(result.monthlySavings).toBe(2730);
  });

  it("computes payback in months against the project cost", () => {
    const result = computeRoi({ ...planExample, projectCost: 18_000 });
    // 43,680 / 12 = 3,640 per month; 18,000 / 3,640 = 4.945…
    expect(result.monthlySavings).toBe(3640);
    expect(result.paybackMonths).toBe(4.9);
  });

  it("computes three-year value gross and net of the project cost", () => {
    const result = computeRoi({ ...planExample, projectCost: 18_000 });
    expect(result.threeYearValue).toBe(131_040);
    expect(result.threeYearNet).toBe(113_040);
  });

  it("computes first-year return on the project cost", () => {
    const result = computeRoi({ ...planExample, projectCost: 20_000 });
    expect(result.firstYearRoiPercent).toBe(118.4);
  });

  it("leaves payback and net value unknown without a project cost", () => {
    const result = computeRoi(planExample);
    expect(result.projectCost).toBeNull();
    expect(result.paybackMonths).toBeNull();
    expect(result.threeYearNet).toBeNull();
    expect(result.firstYearRoiPercent).toBeNull();
  });

  it("cannot pay back when there is nothing to save", () => {
    const result = computeRoi({
      employees: 0,
      hoursPerWeek: 0,
      hourlyCost: 0,
      projectCost: 10_000,
    });
    expect(result.annualSavings).toBe(0);
    expect(result.paybackMonths).toBeNull();
  });

  it("floors negative and non-finite inputs at zero", () => {
    const result = computeRoi({
      employees: -3,
      hoursPerWeek: Number.NaN,
      hourlyCost: 35,
    });
    expect(result.weeklyCost).toBe(0);
  });

  it("clamps an out-of-range savings rate", () => {
    expect(computeRoi({ ...planExample, savingsRate: 4 }).savingsRate).toBe(1);
    expect(computeRoi({ ...planExample, savingsRate: -1 }).savingsRate).toBe(0);
  });

  it("carries the prospect-supplied flag through so the UI never overclaims", () => {
    expect(computeRoi(planExample).prospectSupplied).toBe(false);
    expect(
      computeRoi({ ...planExample, prospectSupplied: true }).prospectSupplied,
    ).toBe(true);
  });
});
