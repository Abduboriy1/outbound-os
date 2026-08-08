/**
 * Follow-up engine (plan §22).
 *
 * Every active lead should have a next action. `classifyFollowUp` is the pure
 * rule the dashboard, the lead list, and the nightly sweep all share, so the
 * badge on a lead means the same thing everywhere.
 */

import { prisma } from "~~/server/lib/db";
import { audit } from "~~/server/lib/audit";
import { OFF_PIPELINE_STAGES } from "~~/shared/stages";
import type { LeadStage } from "~~/server/generated/prisma/client";
import type { Tone } from "~~/shared/tone";

export type FollowUpStatus =
  | "NOT_APPLICABLE"
  | "NO_NEXT_ACTION"
  | "OVERDUE"
  | "DUE_TODAY"
  | "SCHEDULED";

/** Extra badges that can accompany the primary status. */
export type FollowUpFlag = "NO_NEXT_ACTION" | "OVERDUE" | "STALE";

export type FollowUpAssessment = {
  status: FollowUpStatus;
  flags: FollowUpFlag[];
  daysOverdue: number;
  daysSinceActivity: number | null;
  /** Sort key for the daily queue: higher is more urgent. */
  urgency: number;
};

/** A lead is stale when nothing at all has happened for this long. */
export const STALE_AFTER_DAYS = 14;

/** Stages where a missing next action is not a problem. */
const DORMANT_STAGES: LeadStage[] = [
  "WON",
  "LOST",
  "CUSTOMER",
  "NOT_A_FIT",
  "DO_NOT_CONTACT",
];

export type FollowUpLead = {
  stage: LeadStage;
  nextAction?: string | null;
  nextActionDueAt?: Date | string | null;
  lastActivityAt?: Date | string | null;
  lastContactedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function startOfDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

function wholeDaysBetween(from: Date, to: Date): number {
  return Math.floor((startOfDay(to) - startOfDay(from)) / DAY_MS);
}

/**
 * Pure classification. Overdue outranks stale: a lead with a missed action is
 * a task the user already committed to, whereas staleness is an observation.
 */
export function classifyFollowUp(
  lead: FollowUpLead,
  now: Date = new Date(),
): FollowUpAssessment {
  const lastActivity = toDate(lead.lastActivityAt) ?? toDate(lead.lastContactedAt);
  const reference = lastActivity ?? toDate(lead.createdAt);
  const daysSinceActivity = reference ? wholeDaysBetween(reference, now) : null;

  if (DORMANT_STAGES.includes(lead.stage)) {
    return {
      status: "NOT_APPLICABLE",
      flags: [],
      daysOverdue: 0,
      daysSinceActivity,
      urgency: 0,
    };
  }

  const flags: FollowUpFlag[] = [];
  const isStale =
    daysSinceActivity !== null && daysSinceActivity >= STALE_AFTER_DAYS;

  const due = toDate(lead.nextActionDueAt);
  const hasAction = Boolean(lead.nextAction?.trim()) || Boolean(due);

  let status: FollowUpStatus;
  let daysOverdue = 0;

  if (!hasAction) {
    status = "NO_NEXT_ACTION";
    flags.push("NO_NEXT_ACTION");
  } else if (due) {
    const delta = wholeDaysBetween(due, now);
    if (delta > 0) {
      status = "OVERDUE";
      daysOverdue = delta;
      flags.push("OVERDUE");
    } else if (delta === 0) {
      status = "DUE_TODAY";
    } else {
      status = "SCHEDULED";
    }
  } else {
    // An action with no date is scheduled but unanchored; staleness catches it.
    status = "SCHEDULED";
  }

  if (isStale) flags.push("STALE");

  const urgency =
    status === "OVERDUE"
      ? 1000 + daysOverdue
      : status === "NO_NEXT_ACTION"
        ? 500 + (daysSinceActivity ?? 0)
        : status === "DUE_TODAY"
          ? 400
          : isStale
            ? 200 + (daysSinceActivity ?? 0)
            : 0;

  return { status, flags, daysOverdue, daysSinceActivity, urgency };
}

export const FOLLOW_UP_LABELS: Record<FollowUpStatus, string> = {
  NOT_APPLICABLE: "No action needed",
  NO_NEXT_ACTION: "No next action",
  OVERDUE: "Overdue",
  DUE_TODAY: "Due today",
  SCHEDULED: "Scheduled",
};

export const FOLLOW_UP_TONES: Record<FollowUpStatus, Tone> = {
  NOT_APPLICABLE: "neutral",
  NO_NEXT_ACTION: "warning",
  OVERDUE: "danger",
  DUE_TODAY: "accent",
  SCHEDULED: "neutral",
};

/* ------------------------------------------------------ date suggestion */

export type FollowUpContext = {
  /** Reply intent, when the suggestion follows a reply. */
  intent?: string | null;
  stage?: LeadStage | null;
  /** Days the model suggested, which wins when it is present and sane. */
  suggestedDays?: number | null;
  /** How many outbound messages have already gone unanswered. */
  unansweredCount?: number;
};

/** Default cadence by reply intent (plan §22). */
const INTENT_DAYS: Record<string, number | null> = {
  INTERESTED: 2,
  NEEDS_INFO: 2,
  QUESTION: 1,
  NOT_NOW: 90,
  REFERRED_TO_OTHER: 3,
  OUT_OF_OFFICE: 7,
  NOT_INTERESTED: null,
  UNSUBSCRIBE: null,
  AUTO_REPLY: 5,
  OTHER: 4,
};

/** Backoff for unanswered outbound messages: 4, 6, 10, 20 days. */
const NO_REPLY_LADDER = [4, 6, 10, 20];

/**
 * Suggests when to follow up. Returns null when following up would be wrong -
 * an opt-out, a hard no, or a ladder that has run out.
 */
export function suggestFollowUpDate(
  context: FollowUpContext,
  now: Date = new Date(),
): Date | null {
  if (context.intent && context.intent in INTENT_DAYS) {
    const days = INTENT_DAYS[context.intent];
    if (days === null) return null;
    const preferred =
      context.suggestedDays != null &&
      context.suggestedDays > 0 &&
      context.suggestedDays <= 365
        ? context.suggestedDays
        : days;
    return addDays(now, preferred);
  }

  if (context.suggestedDays != null && context.suggestedDays > 0) {
    return addDays(now, Math.min(context.suggestedDays, 365));
  }

  const attempt = context.unansweredCount ?? 0;
  if (attempt >= NO_REPLY_LADDER.length) return null;
  return addDays(now, NO_REPLY_LADDER[attempt]);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Human-readable next action for a suggested follow-up. */
export function describeFollowUp(context: FollowUpContext): string {
  switch (context.intent) {
    case "INTERESTED":
      return "Reply and offer two concrete times for a short call";
    case "NEEDS_INFO":
    case "QUESTION":
      return "Answer their questions and propose a next step";
    case "NOT_NOW":
      return "Follow up next quarter with one useful observation";
    case "REFERRED_TO_OTHER":
      return "Contact the person they pointed to, referencing the introduction";
    case "OUT_OF_OFFICE":
      return "Retry after they return from leave";
    default:
      return "Follow up on the last message";
  }
}

/* ------------------------------------------------------------- database */

export type CreateFollowUpTaskInput = {
  userId: string;
  leadId: string;
  contactId?: string | null;
  title: string;
  detail?: string | null;
  dueAt: Date | null;
  createdByAi?: boolean;
};

/**
 * Creates the task and mirrors it onto the lead's next action so the pipeline
 * views agree with the task list. Existing open tasks with the same title are
 * reused rather than duplicated.
 */
export async function createFollowUpTask(input: CreateFollowUpTaskInput) {
  const existing = await prisma.task.findFirst({
    where: {
      userId: input.userId,
      leadId: input.leadId,
      title: input.title,
      status: "OPEN",
    },
  });

  const task = existing
    ? await prisma.task.update({
        where: { id: existing.id },
        data: { dueAt: input.dueAt, detail: input.detail ?? existing.detail },
      })
    : await prisma.task.create({
        data: {
          userId: input.userId,
          leadId: input.leadId,
          contactId: input.contactId ?? null,
          title: input.title,
          detail: input.detail ?? null,
          dueAt: input.dueAt,
          createdByAi: input.createdByAi ?? false,
        },
      });

  await prisma.lead.update({
    where: { id: input.leadId },
    data: { nextAction: input.title, nextActionDueAt: input.dueAt },
  });

  return task;
}

/**
 * Sweep: gives every active lead without a next action one, and records what
 * it did. Task creation is AUTO_APPROVED per plan §38 - it creates work for
 * the user, it never contacts anybody.
 */
export async function sweepFollowUps(userId: string, now: Date = new Date()) {
  const leads = await prisma.lead.findMany({
    where: {
      userId,
      deletedAt: null,
      stage: { notIn: [...DORMANT_STAGES, ...OFF_PIPELINE_STAGES.filter((s) => s === "COLD")] },
    },
    select: {
      id: true,
      stage: true,
      nextAction: true,
      nextActionDueAt: true,
      lastActivityAt: true,
      lastContactedAt: true,
      createdAt: true,
      contactId: true,
      company: { select: { name: true } },
    },
  });

  let created = 0;
  const flagged: { leadId: string; status: FollowUpStatus }[] = [];

  for (const lead of leads) {
    const assessment = classifyFollowUp(lead, now);
    if (assessment.status === "NOT_APPLICABLE") continue;
    if (assessment.flags.length === 0) continue;

    flagged.push({ leadId: lead.id, status: assessment.status });

    if (assessment.status !== "NO_NEXT_ACTION") continue;

    await createFollowUpTask({
      userId,
      leadId: lead.id,
      contactId: lead.contactId,
      title: `Decide the next step for ${lead.company.name}`,
      detail:
        assessment.daysSinceActivity != null
          ? `No activity for ${assessment.daysSinceActivity} days and no next action set.`
          : "No next action set.",
      dueAt: addDays(now, 1),
      createdByAi: true,
    });
    created += 1;
  }

  if (created > 0) {
    await audit({
      userId,
      actorType: "SYSTEM",
      action: "followup.sweep",
      entityType: "lead",
      metadata: { created, flagged: flagged.length },
    });
  }

  return { created, flagged };
}
