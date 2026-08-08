import type { LeadStage } from "~~/server/generated/prisma/client";
import type { Tone } from "./tone";

/**
 * The stage vocabulary, shared because both sides need it at runtime.
 *
 * This was `src/lib/stages.ts` and stayed `server/lib/stages.ts` through the
 * initial port, which put it out of reach of pages and components (MIGRATION.md
 * §1). Three page agents each answered that by copying the tables into
 * `app/components/{dashboard,outreach,leads}/constants.ts`; this is the one
 * copy those three now re-export. The Prisma import is `import type`, so
 * nothing from the generated client reaches the browser bundle.
 */

/** Ordered pipeline used by the board and funnel analytics (plan §4). */
export const PIPELINE_STAGES: LeadStage[] = [
  "PROSPECT",
  "RESEARCHING",
  "QUALIFIED",
  "READY_FOR_OUTREACH",
  "CONTACTED",
  "RESPONDED",
  "DISCOVERY",
  "OPPORTUNITY",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "CUSTOMER",
];

/** Stages that sit outside the forward-moving pipeline. */
export const OFF_PIPELINE_STAGES: LeadStage[] = [
  "LOST",
  "NOT_A_FIT",
  "DO_NOT_CONTACT",
  "COLD",
  "FOLLOW_UP_LATER",
  "REFERRAL",
  "UPSELL",
];

/**
 * Every stage the enum allows, pipeline first. It lived in
 * `server/lib/leads/stage-rules.ts`, which also holds the transition rules and
 * cannot itself be shared; that module re-exports this.
 */
export const ALL_STAGES: LeadStage[] = [...PIPELINE_STAGES, ...OFF_PIPELINE_STAGES];

export const STAGE_LABELS: Record<LeadStage, string> = {
  PROSPECT: "Prospect",
  RESEARCHING: "Researching",
  QUALIFIED: "Qualified",
  READY_FOR_OUTREACH: "Ready for outreach",
  CONTACTED: "Contacted",
  RESPONDED: "Responded",
  DISCOVERY: "Discovery",
  OPPORTUNITY: "Opportunity",
  PROPOSAL_SENT: "Proposal sent",
  NEGOTIATION: "Negotiation",
  WON: "Won",
  LOST: "Lost",
  CUSTOMER: "Customer",
  REFERRAL: "Referral",
  UPSELL: "Upsell",
  NOT_A_FIT: "Not a fit",
  DO_NOT_CONTACT: "Do not contact",
  COLD: "Cold",
  FOLLOW_UP_LATER: "Follow up later",
};

export const STAGE_TONES: Record<LeadStage, Tone> = {
  PROSPECT: "neutral",
  RESEARCHING: "neutral",
  QUALIFIED: "accent",
  READY_FOR_OUTREACH: "accent",
  CONTACTED: "accent",
  RESPONDED: "positive",
  DISCOVERY: "positive",
  OPPORTUNITY: "positive",
  PROPOSAL_SENT: "warning",
  NEGOTIATION: "warning",
  WON: "positive",
  LOST: "danger",
  CUSTOMER: "positive",
  REFERRAL: "positive",
  UPSELL: "positive",
  NOT_A_FIT: "neutral",
  DO_NOT_CONTACT: "danger",
  COLD: "neutral",
  FOLLOW_UP_LATER: "warning",
};

/**
 * Probability used for the weighted pipeline figure (plan §30). These are
 * starting values, not measured conversion rates — analytics reports the
 * measured funnel separately.
 */
export const STAGE_WIN_PROBABILITY: Partial<Record<LeadStage, number>> = {
  QUALIFIED: 0.05,
  READY_FOR_OUTREACH: 0.05,
  CONTACTED: 0.1,
  RESPONDED: 0.2,
  DISCOVERY: 0.35,
  OPPORTUNITY: 0.5,
  PROPOSAL_SENT: 0.6,
  NEGOTIATION: 0.75,
  WON: 1,
};

/** Stages where contacting the person is forbidden (plan §17). */
export const UNCONTACTABLE_STAGES: LeadStage[] = ["DO_NOT_CONTACT", "NOT_A_FIT"];

export function isPipelineStage(stage: LeadStage) {
  return PIPELINE_STAGES.includes(stage);
}
