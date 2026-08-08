/**
 * Email safety and compliance gate (plan §17, §37).
 *
 * Every send path in the application goes through `assertSendable`. Nothing
 * reaches a prospect that has not passed this check and does not carry a
 * human approval record.
 *
 * The rules themselves live in `evaluateSendability`, which is pure: it takes
 * an already-loaded snapshot and returns the list of reasons a send is
 * blocked. `assertSendable` is the thin database wrapper that builds the
 * snapshot. Keeping them apart is what makes the rules testable without a
 * database.
 */

import { prisma } from "./db";
import { UNCONTACTABLE_STAGES } from "~~/shared/stages";
import type { LeadStage, SuppressionReason } from "~~/server/generated/prisma/client";

/* ----------------------------------------------------------------- types */

export type ComplianceBlockCode =
  | "INVALID_ADDRESS"
  | "SUPPRESSED"
  | "UNCONTACTABLE_STAGE"
  | "BOUNCED"
  | "DAILY_LIMIT"
  | "SENDER_IDENTITY_MISSING"
  | "PHYSICAL_ADDRESS_MISSING";

export type ComplianceBlock = {
  code: ComplianceBlockCode;
  message: string;
};

/** Sender identity required by commercial-email rules (plan §37). */
export type SenderIdentity = {
  senderName: string;
  senderEmail: string;
  physicalAddress: string;
  unsubscribeText: string;
  dailySendLimit: number;
};

export type SendabilitySnapshot = {
  email: string;
  /** Stage of the lead the contact belongs to, or null when unknown. */
  leadStage: LeadStage | null;
  /** Matching suppression-list row, or null. */
  suppression: { reason: SuppressionReason; detail?: string | null } | null;
  /** True when a previous message to this address hard-bounced. */
  hasBounced: boolean;
  /** Outbound messages already sent by this user today. */
  sentToday: number;
  /** Compliance settings row, or null when the user has never configured one. */
  identity: SenderIdentity | null;
};

export type SendabilityResult =
  | { allowed: true; identity: SenderIdentity }
  | { allowed: false; blocks: ComplianceBlock[] };

export class ComplianceError extends Error {
  constructor(readonly blocks: ComplianceBlock[]) {
    super(blocks.map((b) => b.message).join(" "));
    this.name = "ComplianceError";
  }
}

/* -------------------------------------------------------------- helpers */

// Deliberately conservative: an address the regex rejects is one we refuse to
// send to, which is the safe direction to fail in.
const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/;

export function normaliseEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isValidEmail(value: string | null | undefined): boolean {
  return EMAIL_PATTERN.test(normaliseEmail(value));
}

const SUPPRESSION_MESSAGES: Record<SuppressionReason, string> = {
  UNSUBSCRIBED: "This address has opted out of further contact.",
  BOUNCED: "Mail to this address has bounced.",
  COMPLAINT: "This address filed a spam complaint.",
  DO_NOT_CONTACT: "This address is marked do-not-contact.",
  MANUAL: "This address was suppressed manually.",
};

/* ---------------------------------------------------------------- rules */

/**
 * Pure evaluation of every block reason. Returns all applicable blocks rather
 * than the first, so the approval queue can explain the full picture.
 */
export function evaluateSendability(
  snapshot: SendabilitySnapshot,
): SendabilityResult {
  const blocks: ComplianceBlock[] = [];
  const email = normaliseEmail(snapshot.email);

  if (!isValidEmail(email)) {
    blocks.push({
      code: "INVALID_ADDRESS",
      message: `"${snapshot.email}" is not a valid email address.`,
    });
  }

  if (snapshot.suppression) {
    blocks.push({
      code: "SUPPRESSED",
      message: SUPPRESSION_MESSAGES[snapshot.suppression.reason],
    });
  }

  if (snapshot.leadStage && UNCONTACTABLE_STAGES.includes(snapshot.leadStage)) {
    blocks.push({
      code: "UNCONTACTABLE_STAGE",
      message: `The lead is in stage ${snapshot.leadStage}; contacting it is not permitted.`,
    });
  }

  // A bounce recorded on a message is a block in its own right: the
  // suppression row may not have been written yet if ingest failed midway.
  if (snapshot.hasBounced && snapshot.suppression?.reason !== "BOUNCED") {
    blocks.push({
      code: "BOUNCED",
      message: "A previous message to this address bounced.",
    });
  }

  const identity = snapshot.identity;
  if (!identity || !identity.senderEmail.trim() || !identity.senderName.trim()) {
    blocks.push({
      code: "SENDER_IDENTITY_MISSING",
      message:
        "Configure a sender name and sender email in compliance settings before sending.",
    });
  }
  if (!identity || !identity.physicalAddress.trim()) {
    blocks.push({
      code: "PHYSICAL_ADDRESS_MISSING",
      message:
        "Configure a physical mailing address in compliance settings before sending.",
    });
  }

  if (identity && snapshot.sentToday >= identity.dailySendLimit) {
    blocks.push({
      code: "DAILY_LIMIT",
      message: `Daily send limit of ${identity.dailySendLimit} reached (${snapshot.sentToday} sent today).`,
    });
  }

  if (blocks.length > 0) return { allowed: false, blocks };
  // Narrowed by the identity checks above; the checks guarantee it is set.
  return { allowed: true, identity: identity as SenderIdentity };
}

/* --------------------------------------------------------------- footer */

const FOOTER_RULE = "-- ";

/**
 * Appends sender identity, physical address and the opt-out line. Idempotent:
 * re-rendering an already-stamped body (an edited draft, a regeneration) does
 * not stack footers.
 */
export function appendComplianceFooter(
  body: string,
  identity: SenderIdentity,
): string {
  const footer = renderComplianceFooter(identity);
  const trimmed = body.replace(/\s+$/, "");
  if (trimmed.endsWith(footer)) return trimmed;
  return `${trimmed}\n\n${footer}`;
}

export function renderComplianceFooter(identity: SenderIdentity): string {
  return [
    FOOTER_RULE,
    identity.senderName.trim(),
    identity.senderEmail.trim(),
    identity.physicalAddress.trim().replace(/\s*\n\s*/g, ", "),
    "",
    identity.unsubscribeText.trim() ||
      "Reply STOP and I will not contact you again.",
  ].join("\n");
}

/** Convenience for send paths: verify then stamp in one step. */
export function renderOutboundBody(
  body: string,
  identity: SenderIdentity,
): string {
  return appendComplianceFooter(body, identity);
}

/* ------------------------------------------------------------- db gate */

export type AssertSendableInput = {
  userId: string;
  email: string;
  /** Optional: when given, the lead's stage is checked too. */
  leadId?: string | null;
  /** Injectable clock so callers (and tests) control the day boundary. */
  now?: Date;
};

export function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Loads the snapshot for an address and applies the rules. Throws
 * `ComplianceError` when the send is not permitted; otherwise returns the
 * verified sender identity, which the caller must use to stamp the body.
 */
export async function assertSendable(
  input: AssertSendableInput,
): Promise<SenderIdentity> {
  const result = await checkSendable(input);
  if (!result.allowed) throw new ComplianceError(result.blocks);
  return result.identity;
}

/** Non-throwing variant used by the approval queue to pre-flag drafts. */
export async function checkSendable(
  input: AssertSendableInput,
): Promise<SendabilityResult> {
  const email = normaliseEmail(input.email);
  const now = input.now ?? new Date();

  const [settings, suppression, lead, bounced, sentToday] = await Promise.all([
    prisma.complianceSetting.findUnique({ where: { userId: input.userId } }),
    email ? prisma.suppressionEntry.findUnique({ where: { email } }) : null,
    input.leadId
      ? prisma.lead.findFirst({
          where: { id: input.leadId, userId: input.userId, deletedAt: null },
          select: { stage: true },
        })
      : null,
    email
      ? prisma.emailMessage.findFirst({
          where: {
            bounced: true,
            toEmail: email,
            thread: { lead: { userId: input.userId } },
          },
          select: { id: true },
        })
      : null,
    prisma.emailMessage.count({
      where: {
        direction: "OUTBOUND",
        sentAt: { gte: startOfUtcDay(now) },
        thread: { lead: { userId: input.userId } },
      },
    }),
  ]);

  return evaluateSendability({
    email,
    leadStage: lead?.stage ?? null,
    suppression: suppression
      ? { reason: suppression.reason, detail: suppression.detail }
      : null,
    hasBounced: Boolean(bounced),
    sentToday,
    identity: settings
      ? {
          senderName: settings.senderName,
          senderEmail: settings.senderEmail,
          physicalAddress: settings.physicalAddress,
          unsubscribeText: settings.unsubscribeText,
          dailySendLimit: settings.dailySendLimit,
        }
      : null,
  });
}

/** Adds an address to the suppression list. Idempotent by email. */
export async function suppress(
  email: string,
  reason: SuppressionReason,
  detail?: string,
): Promise<void> {
  const normalised = normaliseEmail(email);
  if (!normalised) return;
  await prisma.suppressionEntry.upsert({
    where: { email: normalised },
    create: { email: normalised, reason, detail },
    update: { reason, detail },
  });
}
