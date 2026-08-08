/**
 * Why a sequence enrolment stopped, and the sentence shown for it.
 *
 * Moved out of `server/lib/outreach/sequences.ts`, which also runs the
 * enrolments through Prisma; the sequences page renders these strings
 * (MIGRATION.md §1) and the pause endpoint validates against the same list.
 */
export type PauseReason =
  | "REPLIED"
  | "BOUNCED"
  | "OPTED_OUT"
  | "SUPPRESSED"
  | "MANUAL"
  | "UNCONTACTABLE_STAGE"
  | "NO_CONTACT_EMAIL";

export const PAUSE_REASONS: PauseReason[] = [
  "REPLIED",
  "BOUNCED",
  "OPTED_OUT",
  "SUPPRESSED",
  "MANUAL",
  "UNCONTACTABLE_STAGE",
  "NO_CONTACT_EMAIL",
];

export const PAUSE_MESSAGES: Record<PauseReason, string> = {
  REPLIED: "The prospect replied; the sequence stops so a person takes over.",
  BOUNCED: "A message to this address bounced.",
  OPTED_OUT: "The prospect asked not to be contacted again.",
  SUPPRESSED: "The address is on the suppression list.",
  MANUAL: "Paused by hand.",
  UNCONTACTABLE_STAGE: "The lead is marked do-not-contact or not a fit.",
  NO_CONTACT_EMAIL: "The lead has no contact email address.",
};
