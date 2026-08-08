/**
 * The outreach draft vocabulary: which variants exist and which regeneration
 * hints the approval queue offers, with their button labels.
 *
 * Moved out of `server/lib/ai/agents/outreach.ts`, which also builds the prompt
 * and cannot be shared. The per-hint *instructions* to the model stay there —
 * only the names and labels the UI renders live here (MIGRATION.md §1).
 */

export const OUTREACH_VARIANTS = [
  "EMAIL",
  "SHORT",
  "LINKEDIN_DM",
  "FOLLOW_UP",
  "REFERRAL_INTRO",
] as const;

export type OutreachVariant = (typeof OUTREACH_VARIANTS)[number];

export const VARIANT_LABELS: Record<OutreachVariant, string> = {
  EMAIL: "Email",
  SHORT: "Short version",
  LINKEDIN_DM: "LinkedIn / DM",
  FOLLOW_UP: "Follow-up",
  REFERRAL_INTRO: "Referral introduction request",
};

export const REGENERATION_HINTS = [
  "SHORTER",
  "FRIENDLIER",
  "MORE_DIRECT",
  "LESS_SALESY",
  "FOCUS_ON_ROI",
  "FOCUS_ON_AUTOMATION",
  "DIFFERENT_QUESTION",
] as const;

export type RegenerationHint = (typeof REGENERATION_HINTS)[number];

/** Labels for the approval-queue buttons (plan §16). */
export const HINT_LABELS: Record<RegenerationHint, string> = {
  SHORTER: "Shorter",
  FRIENDLIER: "Friendlier",
  MORE_DIRECT: "More Direct",
  LESS_SALESY: "Less Salesy",
  FOCUS_ON_ROI: "Focus on ROI",
  FOCUS_ON_AUTOMATION: "Focus on Automation",
  DIFFERENT_QUESTION: "Ask a Different Question",
};
