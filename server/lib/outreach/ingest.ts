/**
 * Reply ingest and reply intelligence (plan §17, §18).
 *
 * Polls the email provider, matches messages to threads and leads, handles
 * bounces and opt-outs mechanically, then asks the reply agent to classify,
 * summarise, extract questions and objections, judge sentiment, recommend the
 * next action, and draft a response.
 *
 * The drafted response is persisted as an `OutreachDraft` that still requires
 * approval. This routine never sends anything.
 */

import { prisma } from "~~/server/lib/db";
import { audit } from "~~/server/lib/audit";
import { suppress } from "~~/server/lib/compliance";
import { emailProvider } from "~~/server/lib/email/provider";
import {
  detectAutoReply,
  detectBounce,
  detectOptOut,
} from "~~/server/lib/email/detect";
import { PIPELINE_STAGES } from "~~/shared/stages";
import {
  fallbackReplyAnalysis,
  runReplyAgent,
  type ReplyInput,
  type ReplyOutput,
} from "~~/server/lib/ai/agents/reply";
import type { IncomingEmail } from "~~/server/lib/contracts";
import type { LeadStage, ReplyIntent } from "~~/server/generated/prisma/client";
import { aiRunner } from "./ai";
import { matchObjections, objectionPlaybook } from "~~/shared/outreach/objections";
import { offerForUser } from "~~/shared/outreach/offer";
import {
  addDays,
  createFollowUpTask,
  describeFollowUp,
  suggestFollowUpDate,
} from "./followups";
import { pauseEnrollmentsForLead } from "./sequences";

/** How far back to look when a mailbox has never been polled. */
const COLD_START_DAYS = 30;

const RESPONDED: LeadStage = "RESPONDED";
const PRE_RESPONSE_STAGES: LeadStage[] = PIPELINE_STAGES.slice(
  0,
  PIPELINE_STAGES.indexOf(RESPONDED),
);

export type IngestResult = {
  fetched: number;
  ingested: number;
  bounces: number;
  optOuts: number;
  draftsCreated: number;
  unmatched: number;
  errors: string[];
};

export async function ingestReplies(
  userId: string,
  options: { now?: Date; since?: Date } = {},
): Promise<IngestResult> {
  const now = options.now ?? new Date();
  const since = options.since ?? (await lastInboundAt(userId, now));

  const result: IngestResult = {
    fetched: 0,
    ingested: 0,
    bounces: 0,
    optOuts: 0,
    draftsCreated: 0,
    unmatched: 0,
    errors: [],
  };

  const incoming = await emailProvider(userId).fetchIncoming(since);
  result.fetched = incoming.length;

  for (const message of incoming) {
    try {
      const outcome = await ingestOne(userId, message, now);
      if (outcome === "DUPLICATE") continue;
      if (outcome === "UNMATCHED") {
        result.unmatched += 1;
        continue;
      }
      result.ingested += 1;
      if (outcome.bounced) result.bounces += 1;
      if (outcome.optedOut) result.optOuts += 1;
      if (outcome.draftCreated) result.draftsCreated += 1;
    } catch (error) {
      result.errors.push(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  await audit({
    userId,
    actorType: "SYSTEM",
    action: "email.ingest",
    entityType: "email_message",
    metadata: { ...result, since: since.toISOString() },
  });

  return result;
}

async function lastInboundAt(userId: string, now: Date): Promise<Date> {
  const latest = await prisma.emailMessage.findFirst({
    where: { direction: "INBOUND", thread: { lead: { userId } } },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });
  const floor = addDays(now, -COLD_START_DAYS);
  if (!latest) return floor;
  // Never let the watermark run ahead of the clock, or messages sent after it
  // would fall outside every future poll.
  return latest.sentAt > now ? now : latest.sentAt;
}

type IngestOutcome =
  | "DUPLICATE"
  | "UNMATCHED"
  | { bounced: boolean; optedOut: boolean; draftCreated: boolean };

async function ingestOne(
  userId: string,
  incoming: IncomingEmail,
  now: Date,
): Promise<IngestOutcome> {
  const existing = await prisma.emailMessage.findUnique({
    where: { providerMessageId: incoming.providerMessageId },
    select: { id: true },
  });
  if (existing) return "DUPLICATE";

  const bounce = detectBounce(incoming);
  const match = await matchThread(userId, incoming, bounce.failedRecipient);
  if (!match) return "UNMATCHED";

  const { thread, lead } = match;
  const optOut = bounce.isBounce
    ? { isOptOut: false, matchedPhrase: null }
    : detectOptOut(incoming.body);
  const autoReply = !bounce.isBounce && detectAutoReply(incoming);

  const message = await prisma.emailMessage.create({
    data: {
      threadId: thread.id,
      direction: "INBOUND",
      providerMessageId: incoming.providerMessageId,
      fromEmail: incoming.from.toLowerCase(),
      toEmail: incoming.to.toLowerCase(),
      subject: incoming.subject,
      body: incoming.body,
      snippet: incoming.snippet,
      sentAt: incoming.receivedAt,
      bounced: bounce.isBounce,
    },
  });

  await prisma.emailThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: incoming.receivedAt },
  });

  /* ------------------------------------------------ mechanical handling */

  const contactEmail =
    bounce.failedRecipient ?? lead?.contact?.email?.toLowerCase() ?? null;

  if (bounce.isBounce) {
    if (contactEmail) {
      await suppress(contactEmail, "BOUNCED", bounce.reason ?? undefined);
      await prisma.emailMessage.updateMany({
        where: { threadId: thread.id, direction: "OUTBOUND", toEmail: contactEmail },
        data: { bounced: true },
      });
    }
    if (lead) {
      await pauseEnrollmentsForLead(lead.id, "BOUNCED", userId);
      await prisma.outreachDraft.updateMany({
        where: { leadId: lead.id, status: { in: ["PENDING_APPROVAL", "APPROVED"] } },
        data: { status: "BOUNCED" },
      });
    }
  }

  if (optOut.isOptOut) {
    const address = incoming.from.toLowerCase();
    await suppress(address, "UNSUBSCRIBED", optOut.matchedPhrase ?? undefined);
    if (contactEmail && contactEmail !== address) {
      await suppress(contactEmail, "UNSUBSCRIBED", optOut.matchedPhrase ?? undefined);
    }
    if (lead) {
      await pauseEnrollmentsForLead(lead.id, "OPTED_OUT", userId);
      await setStage(userId, lead.id, lead.stage, "DO_NOT_CONTACT", "Prospect asked not to be contacted");
      await prisma.outreachDraft.updateMany({
        where: { leadId: lead.id, status: { in: ["PENDING_APPROVAL", "APPROVED"] } },
        data: { status: "REJECTED", rejectionReason: "Contact opted out" },
      });
    }
  } else if (!bounce.isBounce && lead && !autoReply) {
    await pauseEnrollmentsForLead(lead.id, "REPLIED", userId);
    await setStage(userId, lead.id, lead.stage, RESPONDED, "Prospect replied");
  }

  /* --------------------------------------------------- reply intelligence */

  const analysis = await analyseReply({
    userId,
    lead,
    thread,
    incoming,
    isBounce: bounce.isBounce,
    isOptOut: optOut.isOptOut,
    isAutoReply: autoReply,
  });

  await prisma.emailMessage.update({
    where: { id: message.id },
    data: {
      intent: toReplyIntent(analysis.intent, bounce.isBounce),
      sentiment: analysis.sentiment,
      aiSummary: analysis.summary,
      questions: analysis.questions,
      objections: analysis.objections.map((objection) => objection.text),
      recommendedAction: analysis.recommendedAction,
      // The columns above cover what the UI lists; the rest of the agent's
      // structured output is kept here rather than discarded.
      replyPayload: {
        buyingSignals: analysis.buyingSignals ?? [],
        objections: analysis.objections,
        pauseSequence: analysis.pauseSequence ?? false,
        confidence: analysis.confidence ?? null,
        suggestedFollowUpDays: analysis.suggestedFollowUpDays ?? null,
      },
    },
  });

  let draftCreated = false;
  if (lead && analysis.draftReply && !optOut.isOptOut && !bounce.isBounce) {
    await prisma.outreachDraft.create({
      data: {
        leadId: lead.id,
        contactId: lead.contactId,
        threadId: thread.id,
        channel: "EMAIL",
        variant: "REPLY",
        subject: analysis.draftReply.subject ?? `Re: ${thread.subject}`,
        body: analysis.draftReply.body,
        status: "PENDING_APPROVAL",
        reason: `Reply received - ${analysis.intent.toLowerCase().replace(/_/g, " ")}`,
      },
    });
    draftCreated = true;
  }

  if (lead) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { lastActivityAt: incoming.receivedAt },
    });

    const dueAt = optOut.isOptOut || bounce.isBounce
      ? null
      : suggestFollowUpDate(
          {
            intent: analysis.intent,
            stage: lead.stage,
            suggestedDays: analysis.suggestedFollowUpDays,
          },
          now,
        );
    if (dueAt) {
      await createFollowUpTask({
        userId,
        leadId: lead.id,
        contactId: lead.contactId,
        title: analysis.recommendedAction || describeFollowUp({ intent: analysis.intent }),
        detail: analysis.summary,
        dueAt,
        createdByAi: true,
      });
    }

    await prisma.activity.create({
      data: {
        userId,
        leadId: lead.id,
        companyId: lead.companyId,
        contactId: lead.contactId,
        type: bounce.isBounce ? "EMAIL_BOUNCED" : "REPLY_RECEIVED",
        summary: bounce.isBounce
          ? `Message to ${contactEmail ?? "the contact"} bounced`
          : `Reply from ${incoming.from}: ${analysis.intent.toLowerCase().replace(/_/g, " ")}`,
        detail: analysis.summary,
        actorType: "SYSTEM",
        metadata: {
          messageId: message.id,
          intent: analysis.intent,
          sentiment: analysis.sentiment,
          questions: analysis.questions,
          objections: analysis.objections,
          optOut: optOut.isOptOut,
        },
      },
    });
  }

  return {
    bounced: bounce.isBounce,
    optedOut: optOut.isOptOut,
    draftCreated,
  };
}

/* --------------------------------------------------------------- agent */

type LeadMatch = NonNullable<Awaited<ReturnType<typeof matchThread>>>["lead"];

async function analyseReply(args: {
  userId: string;
  lead: LeadMatch;
  thread: { id: string; subject: string };
  incoming: IncomingEmail;
  isBounce: boolean;
  isOptOut: boolean;
  isAutoReply: boolean;
}): Promise<ReplyOutput> {
  const snippet =
    args.incoming.body.split("\n").find((line) => line.trim()) ?? "";

  // A bounce is a machine report, not a prospect's words: there is nothing
  // for the agent to interpret and no reply to draft.
  if (args.isBounce || !args.lead) {
    return fallbackReplyAnalysis({
      isBounce: args.isBounce,
      isOptOut: args.isOptOut,
      isAutoReply: args.isAutoReply,
      snippet,
    });
  }

  const messages = await prisma.emailMessage.findMany({
    where: { threadId: args.thread.id },
    orderBy: { sentAt: "asc" },
    take: 20,
  });

  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { name: true, tone: true },
  });

  const caseStudies = await prisma.caseStudy.findMany({
    where: { userId: args.userId },
    take: 5,
    select: {
      slug: true,
      title: true,
      industry: true,
      businessResult: true,
    },
  });

  const input: ReplyInput = {
    incoming: {
      from: args.incoming.from,
      subject: args.incoming.subject,
      body: args.incoming.body,
      receivedAt: args.incoming.receivedAt,
    },
    thread: messages.map((message) => ({
      direction: message.direction,
      subject: message.subject,
      body: message.body,
      sentAt: message.sentAt,
    })),
    company: {
      name: args.lead.company.name,
      industry: args.lead.company.industry,
    },
    contact: {
      firstName: args.lead.contact?.firstName ?? "there",
      lastName: args.lead.contact?.lastName,
      title: args.lead.contact?.title,
    },
    leadStage: args.lead.stage,
    tone: user?.tone ?? "direct, plain, no hype",
    senderName: user?.name ?? "",
    offer: offerForUser(),
    objectionPlaybook: objectionPlaybook(),
    caseStudies,
  };

  try {
    const runner = await aiRunner();
    const { data } = await runReplyAgent(runner, {
      userId: args.userId,
      leadId: args.lead.id,
      input,
    });
    return reconcile(data, args);
  } catch (error) {
    console.error("[ingest] reply agent failed", error);
    return reconcile(
      fallbackReplyAnalysis({
        isBounce: args.isBounce,
        isOptOut: args.isOptOut,
        isAutoReply: args.isAutoReply,
        snippet,
      }),
      args,
    );
  }
}

/**
 * The mechanical detections win over the model. If the text says "unsubscribe"
 * and the model says INTERESTED, we suppress and do not draft a reply.
 */
function reconcile(
  output: ReplyOutput,
  args: { isOptOut: boolean; isAutoReply: boolean; incoming: IncomingEmail },
): ReplyOutput {
  const objections = output.objections.length
    ? output.objections
    : matchObjections(args.incoming.body).map((objection) => ({
        text: objection.label,
        playbookKey: objection.key,
      }));

  if (args.isOptOut) {
    return {
      ...output,
      objections,
      intent: "UNSUBSCRIBE",
      optOutRequested: true,
      pauseSequence: true,
      draftReply: null,
      suggestedFollowUpDays: null,
      recommendedAction:
        "None. The contact has been added to the suppression list.",
    };
  }
  if (args.isAutoReply && output.intent !== "OUT_OF_OFFICE") {
    return {
      ...output,
      objections,
      intent: "OUT_OF_OFFICE",
      draftReply: null,
      pauseSequence: true,
    };
  }
  return { ...output, objections };
}

function toReplyIntent(intent: string, isBounce: boolean): ReplyIntent {
  if (isBounce) return "OTHER";
  return intent as ReplyIntent;
}

/* -------------------------------------------------------------- matching */

const LEAD_INCLUDE = {
  company: { select: { name: true, industry: true } },
  contact: {
    select: { id: true, firstName: true, lastName: true, title: true, email: true },
  },
} as const;

async function matchThread(
  userId: string,
  incoming: IncomingEmail,
  failedRecipient: string | null,
) {
  const byProvider = await prisma.emailThread.findFirst({
    where: {
      providerThreadId: incoming.providerThreadId,
      lead: { userId, deletedAt: null },
    },
    include: { lead: { include: LEAD_INCLUDE } },
  });
  if (byProvider) return { thread: byProvider, lead: byProvider.lead };

  // A bounce arrives from the mail system, so match on the failed recipient
  // rather than the sender.
  const address = (failedRecipient ?? incoming.from).toLowerCase();

  const byContact = await prisma.emailThread.findFirst({
    where: {
      lead: { userId, deletedAt: null },
      OR: [
        { contact: { email: { equals: address, mode: "insensitive" } } },
        { messages: { some: { toEmail: address } } },
      ],
    },
    orderBy: { lastMessageAt: "desc" },
    include: { lead: { include: LEAD_INCLUDE } },
  });
  if (byContact) return { thread: byContact, lead: byContact.lead };

  // No thread, but we may still know the person: open one so the reply is not
  // lost and the lead picks up its context.
  const contact = await prisma.contact.findFirst({
    where: { userId, email: { equals: address, mode: "insensitive" }, deletedAt: null },
    include: { leads: { where: { deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 1 } },
  });
  const leadId = contact?.leads[0]?.id;
  if (!contact || !leadId) return null;

  const created = await prisma.emailThread.create({
    data: {
      leadId,
      contactId: contact.id,
      subject: incoming.subject,
      providerThreadId: incoming.providerThreadId,
      lastMessageAt: incoming.receivedAt,
    },
    include: { lead: { include: LEAD_INCLUDE } },
  });
  return { thread: created, lead: created.lead };
}

async function setStage(
  userId: string,
  leadId: string,
  from: LeadStage,
  to: LeadStage,
  reason: string,
) {
  if (from === to) return;
  if (to === RESPONDED && !PRE_RESPONSE_STAGES.includes(from)) return;

  await prisma.lead.update({ where: { id: leadId }, data: { stage: to } });
  await prisma.leadStageHistory.create({
    data: {
      leadId,
      previousStage: from,
      newStage: to,
      reason,
      actorType: "SYSTEM",
    },
  });
  await prisma.activity.create({
    data: {
      userId,
      leadId,
      type: "STAGE_CHANGED",
      summary: `Stage moved to ${to}`,
      detail: reason,
      actorType: "SYSTEM",
      metadata: { from, to },
    },
  });
}
