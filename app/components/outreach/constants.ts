/**
 * The outreach label / tone maps, now single copies under `shared/`.
 *
 * This file held duplicates of `server/lib/ai/agents/outreach.ts`,
 * `server/lib/stages.ts` and `server/lib/outreach/sequences.ts` because
 * MIGRATION.md §1 forbids a component importing `~~/server/lib/**` at runtime.
 * Those values moved into `shared/`; this re-export keeps the
 * `~/components/outreach/constants` path the pages already use.
 */
import type { LeadStage } from "~~/server/generated/prisma/client";

export {
  HINT_LABELS,
  OUTREACH_VARIANTS,
  REGENERATION_HINTS,
  VARIANT_LABELS,
} from "~~/shared/outreach/variants";
export type {
  OutreachVariant,
  RegenerationHint,
} from "~~/shared/outreach/variants";

export {
  STAGE_LABELS,
  STAGE_TONES,
  UNCONTACTABLE_STAGES,
} from "~~/shared/stages";

export { PAUSE_MESSAGES, PAUSE_REASONS } from "~~/shared/outreach/pause";
export type { PauseReason } from "~~/shared/outreach/pause";

/**
 * The complement of `enrollableLeads`' `notIn` list in
 * `server/lib/outreach/queries.ts`. `/api/leads` filters stages with `in`, so
 * the exclusion has to be spelled out as an inclusion. It has no server
 * original — it exists only because the endpoint takes an inclusion list — so
 * it stays here.
 */
export const ENROLLABLE_STAGES: LeadStage[] = [
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
  "REFERRAL",
  "UPSELL",
  "COLD",
  "FOLLOW_UP_LATER",
];
