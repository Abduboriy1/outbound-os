/**
 * ROI calculator, plan §25.
 *
 * The plan is explicit that an AI estimate is never a confirmed number, so
 * every result carries `prospectSupplied` through untouched and the UI labels
 * the figures accordingly. The maths itself makes no assumption it does not
 * state: `savingsRate` is the share of the measured manual effort the project
 * is expected to remove, and it defaults to 1 only because the caller is
 * required to think about it explicitly.
 */
export type RoiInput = {
  employees: number;
  hoursPerWeek: number;
  /** Fully loaded hourly cost, i.e. salary plus overhead. */
  hourlyCost: number;
  projectCost?: number | null;
  /** True when the inputs came from the prospect rather than an estimate. */
  prospectSupplied?: boolean;
  /** Share of the manual effort the project removes, 0..1. */
  savingsRate?: number;
};

export type RoiResult = {
  weeklyHours: number;
  annualHours: number;
  weeklyCost: number;
  annualCost: number;
  savingsRate: number;
  annualSavings: number;
  monthlySavings: number;
  projectCost: number | null;
  /** Months of savings needed to repay the project. Null without a cost. */
  paybackMonths: number | null;
  /** Gross savings over three years, before project cost. */
  threeYearValue: number;
  /** Three-year savings net of the project cost. Null without a cost. */
  threeYearNet: number | null;
  /** First-year return on the project cost, as a percentage. */
  firstYearRoiPercent: number | null;
  prospectSupplied: boolean;
};

const WEEKS_PER_YEAR = 52;

export function computeRoi(input: RoiInput): RoiResult {
  const employees = nonNegative(input.employees);
  const hoursPerWeek = nonNegative(input.hoursPerWeek);
  const hourlyCost = nonNegative(input.hourlyCost);
  const savingsRate = clamp01(input.savingsRate ?? 1);
  const projectCost =
    input.projectCost == null ? null : Math.max(0, input.projectCost);

  const weeklyHours = employees * hoursPerWeek;
  const weeklyCost = weeklyHours * hourlyCost;
  const annualCost = weeklyCost * WEEKS_PER_YEAR;
  const annualSavings = annualCost * savingsRate;
  const monthlySavings = annualSavings / 12;

  const paybackMonths =
    projectCost != null && monthlySavings > 0
      ? Math.round((projectCost / monthlySavings) * 10) / 10
      : null;

  const threeYearValue = annualSavings * 3;

  return {
    weeklyHours: round2(weeklyHours),
    annualHours: round2(weeklyHours * WEEKS_PER_YEAR),
    weeklyCost: round2(weeklyCost),
    annualCost: round2(annualCost),
    savingsRate,
    annualSavings: round2(annualSavings),
    monthlySavings: round2(monthlySavings),
    projectCost,
    paybackMonths,
    threeYearValue: round2(threeYearValue),
    threeYearNet: projectCost != null ? round2(threeYearValue - projectCost) : null,
    firstYearRoiPercent:
      projectCost != null && projectCost > 0
        ? Math.round(((annualSavings - projectCost) / projectCost) * 1000) / 10
        : null,
    prospectSupplied: input.prospectSupplied ?? false,
  };
}

function nonNegative(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
