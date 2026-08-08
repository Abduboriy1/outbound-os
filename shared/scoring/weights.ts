/**
 * Scoring weights (plan §12: "users should be able to change weighting").
 *
 * Weights live on the ICP as a JSON blob, so retuning is a data change rather
 * than a deploy. `parseWeights` is deliberately forgiving — a half-filled or
 * malformed blob falls back to the defaults per key instead of throwing and
 * blocking the pipeline.
 */

export const FIT_FACTORS = [
  "industry",
  "size",
  "geography",
  "technology",
  "roleAvailability",
  "expectedBudget",
  "businessModel",
] as const;

export const OPPORTUNITY_FACTORS = [
  "painSignals",
  "hiring",
  "manualWorkflows",
  "growth",
  "urgency",
  "decisionMaker",
  "triggerEvent",
] as const;

export type FitFactorKey = (typeof FIT_FACTORS)[number];
export type OpportunityFactorKey = (typeof OPPORTUNITY_FACTORS)[number];

export type ScoringWeights = {
  fit: Record<FitFactorKey, number>;
  opportunity: Record<OpportunityFactorKey, number>;
  /** How fit and opportunity combine into the overall score. Sums to 1. */
  blend: { fit: number; opportunity: number };
};

export const DEFAULT_FIT_WEIGHTS: Record<FitFactorKey, number> = {
  industry: 25,
  size: 20,
  geography: 15,
  technology: 10,
  roleAvailability: 10,
  expectedBudget: 10,
  businessModel: 10,
};

export const DEFAULT_OPPORTUNITY_WEIGHTS: Record<OpportunityFactorKey, number> = {
  painSignals: 30,
  hiring: 15,
  manualWorkflows: 20,
  growth: 10,
  urgency: 10,
  decisionMaker: 10,
  triggerEvent: 5,
};

export const DEFAULT_BLEND = { fit: 0.5, opportunity: 0.5 };

export const DEFAULT_WEIGHTS: ScoringWeights = {
  fit: DEFAULT_FIT_WEIGHTS,
  opportunity: DEFAULT_OPPORTUNITY_WEIGHTS,
  blend: DEFAULT_BLEND,
};

export const FIT_FACTOR_LABELS: Record<FitFactorKey, string> = {
  industry: "Industry",
  size: "Company size",
  geography: "Geography",
  technology: "Technology",
  roleAvailability: "Role availability",
  expectedBudget: "Expected budget",
  businessModel: "Business model",
};

export const OPPORTUNITY_FACTOR_LABELS: Record<OpportunityFactorKey, string> = {
  painSignals: "Pain signals",
  hiring: "Hiring signals",
  manualWorkflows: "Manual workflows",
  growth: "Growth",
  urgency: "Urgency",
  decisionMaker: "Decision maker found",
  triggerEvent: "Trigger event",
};

/**
 * Reads a weights blob. Accepts either the nested shape written by the ICP
 * editor, or a flat `{industry: 30, painSignals: 40}` map, because hand-edited
 * JSON in the wild will be both.
 */
export function parseWeights(input: unknown): ScoringWeights {
  const source = asRecord(input);
  const nestedFit = asRecord(source.fit);
  const nestedOpportunity = asRecord(source.opportunity);
  const blendSource = asRecord(source.blend);

  const fit = { ...DEFAULT_FIT_WEIGHTS };
  for (const key of FIT_FACTORS) {
    const value = pickNumber(nestedFit[key] ?? source[key]);
    if (value !== null) fit[key] = value;
  }

  const opportunity = { ...DEFAULT_OPPORTUNITY_WEIGHTS };
  for (const key of OPPORTUNITY_FACTORS) {
    const value = pickNumber(nestedOpportunity[key] ?? source[key]);
    if (value !== null) opportunity[key] = value;
  }

  const blendFit = pickNumber(blendSource.fit ?? source.fitWeight);
  const blendOpportunity = pickNumber(blendSource.opportunity ?? source.opportunityWeight);
  const blend = normaliseBlend(blendFit, blendOpportunity);

  // A blob of zeros would make every score zero, which reads as a bug rather
  // than a configuration choice. Fall back rather than divide by nothing.
  return {
    fit: sum(Object.values(fit)) > 0 ? fit : { ...DEFAULT_FIT_WEIGHTS },
    opportunity:
      sum(Object.values(opportunity)) > 0 ? opportunity : { ...DEFAULT_OPPORTUNITY_WEIGHTS },
    blend,
  };
}

function normaliseBlend(fit: number | null, opportunity: number | null) {
  if (fit === null && opportunity === null) return { ...DEFAULT_BLEND };
  const f = fit ?? 0;
  const o = opportunity ?? 0;
  const total = f + o;
  if (total <= 0) return { ...DEFAULT_BLEND };
  return { fit: f / total, opportunity: o / total };
}

function pickNumber(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
