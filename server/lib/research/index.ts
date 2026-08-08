export { runResearch, createPendingReport, LeadNotFoundError } from "./pipeline";
export type { RunResearchOptions, RunResearchResult } from "./pipeline";
export {
  detectSignals,
  mergeSignals,
  aiSignal,
  distinctTypes,
  countByFamily,
  normaliseType,
  SIGNAL_RULES,
  SIGNAL_LABELS,
  SIGNAL_TYPES,
  SIGNAL_HYPOTHESES,
} from "./signals";
export type { DetectedSignal, SignalType, SignalFamily, SignalSource } from "./signals";
export { readResearchPayload, RESEARCH_PAYLOAD_VERSION } from "./types";
export type { ResearchPayload } from "./types";
export { detectStaleLeads, STALE_AFTER_DAYS, RESEARCH_STALE_AFTER_DAYS } from "./stale";
export { getSearchProvider, resetSearchProvider } from "./search";
