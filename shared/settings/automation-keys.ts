import type { ApprovalMode } from "~~/server/generated/prisma/client";

/**
 * Verbatim port of `src/app/(app)/settings/automation-keys.ts`.
 *
 * It lives in `shared/` rather than beside the pages because both halves need
 * it at runtime (MIGRATION.md §1): the settings screens render the labels, and
 * `server/api/settings/automation/index.post.ts` re-checks `allowedModes()`
 * server-side so a hidden option cannot be posted anyway. The `ApprovalMode`
 * import is type-only, so nothing from Prisma reaches the browser bundle.
 */

/**
 * The automation types a mode can be set for, with the defaults from plan §38.
 *
 * The defaults are not arbitrary: anything that reaches a prospect requires a
 * human to approve it, and anything that only produces internal information can
 * run on its own.
 */
export const AUTOMATION_KEYS = [
  {
    key: "initial_outreach",
    label: "Initial outreach",
    description: "The first email to a prospect.",
    default: "AI_REVIEW_REQUIRED",
    reachesProspect: true,
  },
  {
    key: "reply",
    label: "Reply",
    description: "Responses to something a prospect sent.",
    default: "AI_REVIEW_REQUIRED",
    reachesProspect: true,
  },
  {
    key: "follow_up_message",
    label: "Follow-up message",
    description: "Scheduled nudges when a thread goes quiet.",
    default: "AI_REVIEW_REQUIRED",
    reachesProspect: true,
  },
  {
    key: "proposal",
    label: "Proposal",
    description: "Proposal drafts assembled from research and discovery notes.",
    default: "AI_REVIEW_REQUIRED",
    reachesProspect: true,
  },
  {
    key: "research",
    label: "Research",
    description: "Company research. Produces internal notes only.",
    default: "AUTO_APPROVED",
    reachesProspect: false,
  },
  {
    key: "lead_scoring",
    label: "Lead scoring",
    description: "Fit and opportunity scores.",
    default: "AUTO_APPROVED",
    reachesProspect: false,
  },
  {
    key: "follow_up_task_creation",
    label: "Follow-up task creation",
    description: "Creating a task reminding you to follow up.",
    default: "AUTO_APPROVED",
    reachesProspect: false,
  },
] as const satisfies readonly {
  key: string;
  label: string;
  description: string;
  default: ApprovalMode;
  reachesProspect: boolean;
}[];

export type AutomationKey = (typeof AUTOMATION_KEYS)[number]["key"];

export const APPROVAL_MODES: ApprovalMode[] = [
  "MANUAL",
  "AI_DRAFT",
  "AI_REVIEW_REQUIRED",
  "AUTO_APPROVED",
  "DISABLED",
];

export const APPROVAL_MODE_LABELS: Record<ApprovalMode, string> = {
  MANUAL: "Manual — you write it yourself",
  AI_DRAFT: "AI draft — saved as a draft, nothing queued",
  AI_REVIEW_REQUIRED: "AI drafts, you approve before it goes",
  AUTO_APPROVED: "Runs automatically",
  DISABLED: "Disabled",
};

/**
 * Modes that would let something reach a prospect without a human. Plan §3 is
 * unambiguous that this must not happen, so the UI refuses to offer it.
 */
export const UNSAFE_FOR_PROSPECT_CONTACT: ApprovalMode[] = ["AUTO_APPROVED"];

export function allowedModes(reachesProspect: boolean): ApprovalMode[] {
  if (!reachesProspect) return APPROVAL_MODES;
  return APPROVAL_MODES.filter((mode) => !UNSAFE_FOR_PROSPECT_CONTACT.includes(mode));
}
