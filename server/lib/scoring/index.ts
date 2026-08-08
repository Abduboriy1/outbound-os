export {
  scoreLead,
  scoreFit,
  scoreOpportunity,
  UNKNOWN_RATIO,
  UNCONSTRAINED_RATIO,
} from "./compute";
export type {
  ScoreInput,
  ScoreBreakdown,
  FactorResult,
  LeadScoreResult,
  IcpInput,
} from "./compute";
export {
  DEFAULT_WEIGHTS,
  DEFAULT_FIT_WEIGHTS,
  DEFAULT_OPPORTUNITY_WEIGHTS,
  DEFAULT_BLEND,
  FIT_FACTORS,
  OPPORTUNITY_FACTORS,
  FIT_FACTOR_LABELS,
  OPPORTUNITY_FACTOR_LABELS,
  parseWeights,
} from "~~/shared/scoring/weights";
export type { ScoringWeights, FitFactorKey, OpportunityFactorKey } from "~~/shared/scoring/weights";
export { scoreLeadById } from "./persist";
