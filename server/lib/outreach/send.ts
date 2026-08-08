/**
 * The one and only send path (plan §16, §17, §37, §38).
 *
 * Two invariants hold here and are the reason this file exists:
 *
 *  1. A message is sent only from a draft that carries an explicit human
 *     approval — `approvedAt` is written in the same transaction as the send,
 *     from a request that came from a person clicking Approve & Send.
 *  2. Every send passes `assertSendable` first, and the body that goes out is
 *     the one that compliance stamped.
 *
 * There is no auto-send in this version. Sequences, reply intelligence, and
 * the follow-up engine all produce drafts and stop.
 */

import { prisma } from "~~/server/lib/db";
import { audit } from "~~/server/lib/audit";
import { HttpError } from "~~/server/lib/api";
import {
  ComplianceError,
  assertSendable,
  normaliseEmail,
  renderOutboundBody,
} from "~~/server/lib/compliance";
import { emailProvider } from "~~/server/lib/email/provider";
import { PIPELINE_STAGES } from "~~/shared/stages";
import type { LeadStage, OutreachDraft } from "~~/server/generated/prisma/client";
import { addDays, createFollowUpTask, suggestFollowUpDate } from "./followups";
import { findPlaceholders } from "~~/shared/outreach/templates";

export type ApproveAndSendInput = {
  userId: string;
  draftId: string;
  /** Human edits made in the approval queue, if any. */
  subject?: string | null;
  body?: string | null;
  now?: Date;
};

export type ApproveAndSendResult = {
  draft: OutreachDraft;
  threadId: string;
  messageId: string;
  providerMessageId: string;
};

/** Stage the lead moves to once the first message goes out. */
const CONTACTED: LeadStage = "CONTACTED";

/** Stages that sit before CONTACTED and should advance on a send. */
const PRE_CONTACT_STAGES: LeadStage[] = PIPELINE_STAGES.slice(
  0,
  PIPELINE_STAGES.indexOf(CONTACTED),
);

export async function approveAndSend(
  input: ApproveAndSendInput,
): Promise<ApproveAndSendResult> {
  const now = input.now ?? new Date();

  const draft = await prisma.outreachDraft.findFirst({
    where: { id: input.draftId, lead: { userId: input.userId, deletedAt: null } },
    include: {
      lead: { include: { company: true, contact: true } },
      contact: true,
    },
  });
  if (!draft) throw new HttpError("Draft not found", 404);
  if (draft.status === "SENT") throw new HttpError("Draft was already sent", 409);
  if (draft.status === "REJECTED")
    throw new HttpError("Draft was rejected and cannot be sent", 409);
  if (draft.channel !== "EMAIL") {
    throw new HttpError(
      "This draft is for a channel the app does not send on. Approve it for manual sending instead.",
      400,
    );
  }

  const contact = draft.contact ?? draft.lead.contact;
  const to = normaliseEmail(contact?.email);
  if (!to) throw new HttpError("The contact has no email address", 400);

  // Compliance runs before anything is mutated, so a blocked send leaves no
  // half-approved draft behind.
  const identity = await assertSendable({
    userId: input.userId,
    email: to,
    leadId: draft.leadId,
    now,
  });

  const subject =
    (input.subject ?? draft.subject ?? "").trim() ||
    `Quick question about ${draft.lead.company.name}`;
  const rawBody = (input.body ?? draft.body).trim();
  if (!rawBody) throw new HttpError("The message body is empty", 400);

  // An unfilled merge field is the clearest possible signal that a message is
  // mass outreach. It never leaves the building.
  const unfilled = [
    ...findPlaceholders(rawBody),
    ...findPlaceholders(subject),
  ];
  if (unfilled.length > 0) {
    throw new HttpError(
      `The message still contains unfilled placeholders: ${unfilled.join(", ")}`,
      400,
    );
  }

  const body = renderOutboundBody(rawBody, identity);

  const thread = await findOrCreateThread({
    leadId: draft.leadId,
    contactId: contact?.id ?? null,
    subject,
    threadId: draft.threadId,
  });
  const lastMessage = await prisma.emailMessage.findFirst({
    where: { threadId: thread.id },
    orderBy: { sentAt: "desc" },
    select: { providerMessageId: true },
  });

  // The approval record is written before the send: if the provider call
  // fails we must still be able to prove a human authorised the attempt.
  await prisma.outreachDraft.update({
    where: { id: draft.id },
    data: { status: "APPROVED", approvedAt: now, subject, body: rawBody },
  });
  await audit({
    userId: input.userId,
    actorType: "HUMAN",
    action: "outreach.draft.approve",
    entityType: "outreach_draft",
    entityId: draft.id,
    metadata: {
      leadId: draft.leadId,
      to,
      edited: input.body != null && input.body.trim() !== draft.body.trim(),
    },
  });

  let sent;
  try {
    sent = await emailProvider(input.userId).send({
      to,
      toName: [contact?.firstName, contact?.lastName].filter(Boolean).join(" "),
      from: identity.senderEmail,
      fromName: identity.senderName,
      subject,
      body,
      threadId: thread.providerThreadId ?? undefined,
      inReplyTo: lastMessage?.providerMessageId ?? undefined,
    });
  } catch (error) {
    await prisma.outreachDraft.update({
      where: { id: draft.id },
      data: { status: "FAILED" },
    });
    await audit({
      userId: input.userId,
      actorType: "SYSTEM",
      action: "outreach.send.failed",
      entityType: "outreach_draft",
      entityId: draft.id,
      metadata: { message: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }

  if (!thread.providerThreadId) {
    await prisma.emailThread.update({
      where: { id: thread.id },
      data: { providerThreadId: sent.providerThreadId },
    });
  }

  const message = await prisma.emailMessage.create({
    data: {
      threadId: thread.id,
      direction: "OUTBOUND",
      providerMessageId: sent.providerMessageId,
      fromEmail: identity.senderEmail,
      toEmail: to,
      subject,
      body,
      snippet: rawBody.split("\n").find((line) => line.trim())?.slice(0, 200) ?? "",
      sentAt: sent.sentAt,
    },
  });

  await prisma.emailThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: sent.sentAt },
  });

  const updated = await prisma.outreachDraft.update({
    where: { id: draft.id },
    data: { status: "SENT", sentAt: sent.sentAt, messageId: message.id },
  });

  await advanceStageOnSend(input.userId, draft.leadId, draft.lead.stage, now);

  await prisma.lead.update({
    where: { id: draft.leadId },
    data: { lastContactedAt: sent.sentAt, lastActivityAt: sent.sentAt },
  });
  if (contact) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { lastInteractionAt: sent.sentAt },
    });
  }

  await prisma.activity.create({
    data: {
      userId: input.userId,
      leadId: draft.leadId,
      companyId: draft.lead.companyId,
      contactId: contact?.id ?? null,
      type: "OUTREACH_SENT",
      summary: `Sent "${subject}" to ${to}`,
      detail: rawBody.slice(0, 2000),
      actorType: "HUMAN",
      metadata: {
        draftId: draft.id,
        messageId: message.id,
        threadId: thread.id,
        variant: draft.variant,
        provider: emailProvider(input.userId).name,
      },
    },
  });

  await audit({
    userId: input.userId,
    actorType: "HUMAN",
    action: "outreach.send",
    entityType: "email_message",
    entityId: message.id,
    metadata: {
      draftId: draft.id,
      leadId: draft.leadId,
      to,
      providerMessageId: sent.providerMessageId,
    },
  });

  await scheduleFollowUp({
    userId: input.userId,
    leadId: draft.leadId,
    contactId: contact?.id ?? null,
    companyName: draft.lead.company.name,
    threadId: thread.id,
    now,
  });

  return {
    draft: updated,
    threadId: thread.id,
    messageId: message.id,
    providerMessageId: sent.providerMessageId,
  };
}

/* --------------------------------------------------------------- reject */

export async function rejectDraft(input: {
  userId: string;
  draftId: string;
  reason: string;
}) {
  const draft = await prisma.outreachDraft.findFirst({
    where: { id: input.draftId, lead: { userId: input.userId, deletedAt: null } },
  });
  if (!draft) throw new HttpError("Draft not found", 404);
  if (draft.status === "SENT")
    throw new HttpError("Draft was already sent", 409);

  const updated = await prisma.outreachDraft.update({
    where: { id: draft.id },
    data: {
      status: "REJECTED",
      rejectedAt: new Date(),
      rejectionReason: input.reason,
    },
  });

  await prisma.activity.create({
    data: {
      userId: input.userId,
      leadId: draft.leadId,
      type: "OUTREACH_REJECTED",
      summary: "Outreach draft rejected",
      detail: input.reason,
      actorType: "HUMAN",
      metadata: { draftId: draft.id },
    },
  });

  await audit({
    userId: input.userId,
    actorType: "HUMAN",
    action: "outreach.draft.reject",
    entityType: "outreach_draft",
    entityId: draft.id,
    metadata: { reason: input.reason },
  });

  return updated;
}

/**
 * Non-email channels (LinkedIn, DM) cannot be sent by the app. Approving one
 * records the human decision and creates the task to send it by hand — it
 * never marks the message as delivered.
 */
export async function approveForManualSend(input: {
  userId: string;
  draftId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const draft = await prisma.outreachDraft.findFirst({
    where: { id: input.draftId, lead: { userId: input.userId, deletedAt: null } },
    include: { lead: { include: { company: true } } },
  });
  if (!draft) throw new HttpError("Draft not found", 404);

  const updated = await prisma.outreachDraft.update({
    where: { id: draft.id },
    data: { status: "APPROVED", approvedAt: now },
  });

  await createFollowUpTask({
    userId: input.userId,
    leadId: draft.leadId,
    contactId: draft.contactId,
    title: `Send the ${draft.channel.toLowerCase()} message to ${draft.lead.company.name}`,
    detail: draft.body.slice(0, 2000),
    dueAt: addDays(now, 1),
  });

  await audit({
    userId: input.userId,
    actorType: "HUMAN",
    action: "outreach.draft.approveManual",
    entityType: "outreach_draft",
    entityId: draft.id,
    metadata: { channel: draft.channel },
  });

  return updated;
}

/* -------------------------------------------------------------- helpers */

async function findOrCreateThread(input: {
  leadId: string;
  contactId: string | null;
  subject: string;
  /** Set on reply drafts — answer the conversation the draft was written for. */
  threadId?: string | null;
}) {
  if (input.threadId) {
    const linked = await prisma.emailThread.findFirst({
      where: { id: input.threadId, leadId: input.leadId },
    });
    if (linked) return linked;
  }

  // Falling back to the newest open thread is right for the common single
  // conversation, and is only reached when a draft carries no thread link.
  const existing = await prisma.emailThread.findFirst({
    where: { leadId: input.leadId, isClosed: false },
    orderBy: { lastMessageAt: "desc" },
  });
  if (existing) return existing;

  return prisma.emailThread.create({
    data: {
      leadId: input.leadId,
      contactId: input.contactId,
      subject: input.subject,
    },
  });
}

async function advanceStageOnSend(
  userId: string,
  leadId: string,
  currentStage: LeadStage,
  now: Date,
) {
  if (!PRE_CONTACT_STAGES.includes(currentStage)) return;

  await prisma.lead.update({
    where: { id: leadId },
    data: { stage: CONTACTED },
  });
  await prisma.leadStageHistory.create({
    data: {
      leadId,
      previousStage: currentStage,
      newStage: CONTACTED,
      reason: "Approved outreach sent",
      actorType: "HUMAN",
      actorId: userId,
      createdAt: now,
    },
  });
  await prisma.activity.create({
    data: {
      userId,
      leadId,
      type: "STAGE_CHANGED",
      summary: `Stage moved to ${CONTACTED}`,
      actorType: "HUMAN",
      metadata: { from: currentStage, to: CONTACTED },
    },
  });
}

async function scheduleFollowUp(input: {
  userId: string;
  leadId: string;
  contactId: string | null;
  companyName: string;
  threadId: string;
  now: Date;
}) {
  const unanswered = await prisma.emailMessage.count({
    where: { threadId: input.threadId, direction: "OUTBOUND" },
  });
  const dueAt = suggestFollowUpDate(
    { unansweredCount: Math.max(0, unanswered - 1) },
    input.now,
  );
  if (!dueAt) return;

  await createFollowUpTask({
    userId: input.userId,
    leadId: input.leadId,
    contactId: input.contactId,
    title: `Follow up with ${input.companyName}`,
    detail: "No reply yet to the last message.",
    dueAt,
    createdByAi: true,
  });
}

export { ComplianceError };
