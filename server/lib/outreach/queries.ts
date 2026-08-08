/**
 * Read models for the outreach pages. Kept out of the components so the pages
 * stay server components with one query each, and so the compliance pre-flight
 * runs in exactly one place.
 */

import { prisma } from "~~/server/lib/db";
import { checkSendable, type ComplianceBlock } from "~~/server/lib/compliance";
import { emailProviderName } from "~~/server/lib/email/provider";
import { findPlaceholders } from "~~/shared/outreach/templates";

export type ApprovalCardData = {
  id: string;
  leadId: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactTitle: string | null;
  channel: string;
  variant: string;
  subject: string | null;
  body: string;
  reason: string | null;
  score: number | null;
  stage: string;
  regenerationHint: string | null;
  regeneratedFrom: { id: string; body: string } | null;
  createdAt: Date;
  /** Compliance blocks that would stop this send right now. */
  blocks: ComplianceBlock[];
  placeholders: string[];
};

export async function pendingApprovals(
  userId: string,
): Promise<ApprovalCardData[]> {
  const drafts = await prisma.outreachDraft.findMany({
    where: {
      status: "PENDING_APPROVAL",
      lead: { userId, deletedAt: null },
    },
    orderBy: [{ createdAt: "desc" }],
    include: {
      contact: true,
      lead: {
        select: {
          id: true,
          stage: true,
          overallScore: true,
          company: { select: { name: true } },
          contact: true,
        },
      },
    },
  });

  const cards: ApprovalCardData[] = [];
  for (const draft of drafts) {
    const contact = draft.contact ?? draft.lead.contact;
    const email = contact?.email ?? null;

    const check =
      draft.channel === "EMAIL" && email
        ? await checkSendable({ userId, email, leadId: draft.leadId })
        : null;

    const previous = draft.regenerationOf
      ? await prisma.outreachDraft.findUnique({
          where: { id: draft.regenerationOf },
          select: { id: true, body: true },
        })
      : null;

    cards.push({
      id: draft.id,
      leadId: draft.leadId,
      companyName: draft.lead.company.name,
      contactName: contact
        ? [contact.firstName, contact.lastName].filter(Boolean).join(" ")
        : null,
      contactEmail: email,
      contactTitle: contact?.title ?? null,
      channel: draft.channel,
      variant: draft.variant,
      subject: draft.subject,
      body: draft.body,
      reason: draft.reason,
      score: draft.lead.overallScore,
      stage: draft.lead.stage,
      regenerationHint: draft.regenerationHint,
      regeneratedFrom: previous,
      createdAt: draft.createdAt,
      blocks:
        draft.channel !== "EMAIL"
          ? []
          : !email
            ? [
                {
                  code: "INVALID_ADDRESS" as const,
                  message: "The contact has no email address.",
                },
              ]
            : check && !check.allowed
              ? check.blocks
              : [],
      placeholders: [
        ...findPlaceholders(draft.body),
        ...findPlaceholders(draft.subject ?? ""),
      ],
    });
  }

  return cards;
}

/** Leads that are ready for a first message but have no draft waiting. */
export async function leadsAwaitingDraft(userId: string) {
  return prisma.lead.findMany({
    where: {
      userId,
      deletedAt: null,
      stage: { in: ["QUALIFIED", "READY_FOR_OUTREACH"] },
      contact: { isNot: null },
      outreachDrafts: {
        none: { status: { in: ["PENDING_APPROVAL", "APPROVED", "SENT"] } },
      },
    },
    orderBy: [{ overallScore: "desc" }],
    take: 20,
    select: {
      id: true,
      stage: true,
      overallScore: true,
      company: { select: { name: true, industry: true } },
      contact: { select: { firstName: true, lastName: true, title: true } },
      opportunities: { select: { title: true }, take: 1 },
    },
  });
}

/* ---------------------------------------------------------------- inbox */

export async function inboxThreads(userId: string) {
  return prisma.emailThread.findMany({
    where: { lead: { userId, deletedAt: null } },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
    include: {
      lead: {
        select: {
          id: true,
          stage: true,
          overallScore: true,
          company: { select: { name: true, industry: true } },
        },
      },
      contact: { select: { firstName: true, lastName: true, email: true, title: true } },
      messages: { orderBy: { sentAt: "desc" }, take: 1 },
      _count: { select: { messages: true } },
    },
  });
}

export async function threadDetail(userId: string, threadId: string) {
  return prisma.emailThread.findFirst({
    where: { id: threadId, lead: { userId, deletedAt: null } },
    include: {
      lead: {
        select: {
          id: true,
          stage: true,
          overallScore: true,
          nextAction: true,
          nextActionDueAt: true,
          company: { select: { name: true, industry: true, website: true } },
          opportunities: { select: { title: true, problem: true }, take: 3 },
        },
      },
      contact: true,
      messages: { orderBy: { sentAt: "asc" } },
    },
  });
}

/* ------------------------------------------------------------ sequences */

export async function sequencesOverview(userId: string) {
  return prisma.emailSequence.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      steps: { orderBy: { dayOffset: "asc" } },
      enrollments: {
        include: {
          lead: {
            select: {
              id: true,
              stage: true,
              company: { select: { name: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
}

export async function enrollableLeads(userId: string) {
  return prisma.lead.findMany({
    where: {
      userId,
      deletedAt: null,
      stage: { notIn: ["DO_NOT_CONTACT", "NOT_A_FIT", "WON", "LOST", "CUSTOMER"] },
      contact: { isNot: null },
    },
    orderBy: { overallScore: "desc" },
    take: 100,
    select: {
      id: true,
      stage: true,
      overallScore: true,
      company: { select: { name: true } },
    },
  });
}

/* ----------------------------------------------------------- compliance */

export type ComplianceStatus = {
  provider: string;
  configured: boolean;
  senderName: string;
  senderEmail: string;
  physicalAddress: string;
  unsubscribeText: string;
  dailySendLimit: number;
  sentToday: number;
  suppressed: number;
};

export async function complianceStatus(
  userId: string,
): Promise<ComplianceStatus> {
  const [settings, sentToday, suppressed] = await Promise.all([
    prisma.complianceSetting.findUnique({ where: { userId } }),
    prisma.emailMessage.count({
      where: {
        direction: "OUTBOUND",
        sentAt: { gte: new Date(new Date().toISOString().slice(0, 10)) },
        thread: { lead: { userId } },
      },
    }),
    prisma.suppressionEntry.count(),
  ]);

  return {
    provider: emailProviderName(),
    configured: Boolean(
      settings?.senderEmail.trim() &&
        settings?.senderName.trim() &&
        settings?.physicalAddress.trim(),
    ),
    senderName: settings?.senderName ?? "",
    senderEmail: settings?.senderEmail ?? "",
    physicalAddress: settings?.physicalAddress ?? "",
    unsubscribeText: settings?.unsubscribeText ?? "",
    dailySendLimit: settings?.dailySendLimit ?? 50,
    sentToday,
    suppressed,
  };
}
