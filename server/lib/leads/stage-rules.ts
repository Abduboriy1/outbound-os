import type { LeadStage } from "~~/server/generated/prisma/client";
import { ALL_STAGES } from "~~/shared/stages";

/** Every stage the enum allows, pipeline first. Now defined in `shared/`. */
export { ALL_STAGES };

/**
 * Stages that end the conversation. Anything not listed here implies we may
 * still reach out, which is what makes a move into it dangerous for a lead the
 * operator has already marked DO_NOT_CONTACT (plan §17).
 */
export const NON_CONTACTABLE_STAGES: LeadStage[] = [
  "DO_NOT_CONTACT",
  "NOT_A_FIT",
  "LOST",
  "COLD",
];

/** Stages that require an explanation before the lead can enter them. */
export const REASON_REQUIRED_STAGES: LeadStage[] = ["LOST", "DO_NOT_CONTACT"];

export function isKnownStage(value: string): value is LeadStage {
  return (ALL_STAGES as string[]).includes(value);
}

export function isContactableStage(stage: LeadStage) {
  return !NON_CONTACTABLE_STAGES.includes(stage);
}

export type TransitionRejection =
  | "unknown_stage"
  | "no_change"
  | "do_not_contact"
  | "reason_required";

export type TransitionResult =
  | { ok: true }
  | { ok: false; code: TransitionRejection; message: string };

/**
 * The single source of truth for whether a stage move is allowed. Kept pure so
 * the rules can be tested without a database, and so every caller — board,
 * workspace, REST, background jobs — enforces the same policy.
 */
export function checkStageTransition(input: {
  from: LeadStage;
  to: string;
  reason?: string | null;
}): TransitionResult {
  const { from, reason } = input;

  if (!isKnownStage(input.to)) {
    return {
      ok: false,
      code: "unknown_stage",
      message: `${input.to} is not a valid pipeline stage`,
    };
  }
  const to = input.to;

  if (from === to) {
    return { ok: false, code: "no_change", message: "Lead is already in that stage" };
  }

  if (from === "DO_NOT_CONTACT" && isContactableStage(to)) {
    return {
      ok: false,
      code: "do_not_contact",
      message:
        "This lead is marked do not contact. Clear that decision explicitly before returning it to the pipeline.",
    };
  }

  if (REASON_REQUIRED_STAGES.includes(to) && !reason?.trim()) {
    return {
      ok: false,
      code: "reason_required",
      message: "A reason is required for this stage",
    };
  }

  return { ok: true };
}

export type StagePatch = {
  wonAt?: Date | null;
  lostAt?: Date | null;
  lostReason?: string | null;
};

/**
 * Timestamp bookkeeping that must accompany a stage change. Returned as a patch
 * rather than applied inline so the transition service stays a single update.
 */
export function stageSideEffects(
  to: LeadStage,
  now: Date,
  reason?: string | null,
): StagePatch {
  if (to === "WON") return { wonAt: now, lostAt: null, lostReason: null };
  if (to === "LOST" || to === "NOT_A_FIT")
    return { lostAt: now, lostReason: reason?.trim() || null, wonAt: null };
  return {};
}
