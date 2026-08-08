/**
 * Outreach sequences (plan §23).
 *
 * A sequence is a list of steps defined by day offset and purpose. The runner
 * advances due steps, but every step it produces lands in the approval queue
 * as a `PENDING_APPROVAL` draft — a sequence can never put a message in front
 * of a prospect on its own.
 *
 * Enrolments pause immediately on reply, bounce, opt-out, or manual pause. The
 * pause rule is pure so it can be exhaustively tested.
 */

import { prisma } from "~~/server/lib/db";
import { audit } from "~~/server/lib/audit";
import { UNCONTACTABLE_STAGES } from "~~/shared/stages";
import type { LeadStage } from "~~/server/generated/prisma/client";
import { addDays } from "./followups";
import type { OutreachVariant } from "~~/server/lib/ai/agents/outreach";
import {
  PAUSE_MESSAGES,
  PAUSE_REASONS,
  type PauseReason,
} from "~~/shared/outreach/pause";

/* ------------------------------------------------------------ pure rules */

export const ENROLLMENT_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "STOPPED",
] as const;

export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

/**
 * Moved to `shared/outreach/pause.ts` so the sequences page can render the
 * reason for a paused enrolment (MIGRATION.md §1).
 */
export { PAUSE_MESSAGES, PAUSE_REASONS };
export type { PauseReason };

export type EnrollmentSignals = {
  status: string;
  /** Set when a human pressed pause. */
  manuallyPaused?: boolean;
  hasInboundReply: boolean;
  hasBounce: boolean;
  optedOut: boolean;
  suppressed: boolean;
  leadStage: LeadStage;
  hasContactEmail: boolean;
};

export type PauseDecision =
  | { paused: false }
  | { paused: true; reason: PauseReason; message: string };

/**
 * Ordered by severity so the recorded reason is the most specific one. Opt-out
 * and bounce come first because they also carry compliance consequences.
 */
export function evaluatePause(signals: EnrollmentSignals): PauseDecision {
  const reason = firstPauseReason(signals);
  if (!reason) return { paused: false };
  return { paused: true, reason, message: PAUSE_MESSAGES[reason] };
}

function firstPauseReason(signals: EnrollmentSignals): PauseReason | null {
  if (signals.manuallyPaused) return "MANUAL";
  if (signals.optedOut) return "OPTED_OUT";
  if (signals.suppressed) return "SUPPRESSED";
  if (signals.hasBounce) return "BOUNCED";
  if (UNCONTACTABLE_STAGES.includes(signals.leadStage))
    return "UNCONTACTABLE_STAGE";
  if (signals.hasInboundReply) return "REPLIED";
  if (!signals.hasContactEmail) return "NO_CONTACT_EMAIL";
  return null;
}

export type StepLike = {
  id: string;
  dayOffset: number;
  purpose: string;
  channel: string;
  template?: string | null;
};

export function orderedSteps<T extends { dayOffset: number }>(steps: T[]): T[] {
  return [...steps].sort((a, b) => a.dayOffset - b.dayOffset);
}

/**
 * The step that is ready to be generated, or null. `currentStep` is the count
 * of steps already produced, so it doubles as the index of the next one.
 */
export function dueStep<T extends StepLike>(input: {
  steps: T[];
  currentStep: number;
  enrolledAt: Date;
  now: Date;
}): T | null {
  const steps = orderedSteps(input.steps);
  const next = steps[input.currentStep];
  if (!next) return null;
  return dueAt(input.enrolledAt, next.dayOffset) <= input.now ? next : null;
}

export function dueAt(enrolledAt: Date, dayOffset: number): Date {
  return addDays(enrolledAt, dayOffset);
}

/** When the runner should next look at this enrolment. */
export function nextRunAtFor<T extends StepLike>(
  steps: T[],
  currentStep: number,
  enrolledAt: Date,
): Date | null {
  const ordered = orderedSteps(steps);
  const next = ordered[currentStep];
  return next ? dueAt(enrolledAt, next.dayOffset) : null;
}

export function isComplete(stepCount: number, currentStep: number): boolean {
  return currentStep >= stepCount;
}

/** Step 0 opens the conversation; everything after it is a follow-up. */
export function variantForStep(
  step: StepLike,
  index: number,
): OutreachVariant {
  if (step.channel === "LINKEDIN") return "LINKEDIN_DM";
  if (index === 0) return "EMAIL";
  return "FOLLOW_UP";
}

/* ------------------------------------------------------------- database */

export type SequenceRunResult = {
  generated: number;
  paused: { enrollmentId: string; reason: PauseReason }[];
  completed: number;
  errors: { enrollmentId: string; message: string }[];
};

/**
 * Advances every due enrolment for a user. Produces drafts only: the approval
 * queue remains the sole path to a prospect.
 */
export async function runSequences(
  userId: string,
  now: Date = new Date(),
): Promise<SequenceRunResult> {
  // Imported here rather than at module scope: the generator pulls in the
  // server-only auth chain, and the pause rules above must stay importable
  // from a plain unit test.
  const { generateDraft } = await import("./generate");

  const result: SequenceRunResult = {
    generated: 0,
    paused: [],
    completed: 0,
    errors: [],
  };

  const enrollments = await prisma.sequenceEnrollment.findMany({
    where: {
      status: "ACTIVE",
      lead: { userId, deletedAt: null },
      sequence: { isActive: true },
    },
    include: {
      sequence: { include: { steps: true } },
      lead: {
        select: {
          id: true,
          stage: true,
          contactId: true,
          contact: { select: { id: true, email: true } },
          emailThreads: {
            select: {
              messages: {
                select: { direction: true, bounced: true, intent: true },
              },
            },
          },
        },
      },
    },
  });

  for (const enrollment of enrollments) {
    try {
      const messages = enrollment.lead.emailThreads.flatMap((t) => t.messages);
      const email = enrollment.lead.contact?.email ?? null;
      const suppressed = email
        ? Boolean(
            await prisma.suppressionEntry.findUnique({
              where: { email: email.toLowerCase() },
            }),
          )
        : false;

      const decision = evaluatePause({
        status: enrollment.status,
        hasInboundReply: messages.some((m) => m.direction === "INBOUND" && m.intent !== "AUTO_REPLY"),
        hasBounce: messages.some((m) => m.bounced),
        optedOut: messages.some((m) => m.intent === "UNSUBSCRIBE"),
        suppressed,
        leadStage: enrollment.lead.stage,
        hasContactEmail: Boolean(email),
      });

      if (decision.paused) {
        await pauseEnrollment(enrollment.id, decision.reason, userId);
        result.paused.push({
          enrollmentId: enrollment.id,
          reason: decision.reason,
        });
        continue;
      }

      const steps = orderedSteps(enrollment.sequence.steps);
      if (isComplete(steps.length, enrollment.currentStep)) {
        await prisma.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { status: "COMPLETED", nextRunAt: null },
        });
        result.completed += 1;
        continue;
      }

      const step = dueStep({
        steps,
        currentStep: enrollment.currentStep,
        enrolledAt: enrollment.enrolledAt,
        now,
      });
      if (!step) continue;

      await generateDraft({
        userId,
        leadId: enrollment.leadId,
        variant: variantForStep(step, enrollment.currentStep),
        reason: `Sequence "${enrollment.sequence.name}" day ${step.dayOffset}: ${step.purpose}`,
      });

      const currentStep = enrollment.currentStep + 1;
      await prisma.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: {
          currentStep,
          status: isComplete(steps.length, currentStep) ? "COMPLETED" : "ACTIVE",
          nextRunAt: nextRunAtFor(steps, currentStep, enrollment.enrolledAt),
        },
      });
      result.generated += 1;
    } catch (error) {
      result.errors.push({
        enrollmentId: enrollment.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await audit({
    userId,
    actorType: "SYSTEM",
    action: "sequence.run",
    entityType: "sequence_enrollment",
    metadata: {
      generated: result.generated,
      paused: result.paused.length,
      completed: result.completed,
      errors: result.errors.length,
    },
  });

  return result;
}

export async function pauseEnrollment(
  enrollmentId: string,
  reason: PauseReason,
  userId: string,
) {
  const enrollment = await prisma.sequenceEnrollment.update({
    where: { id: enrollmentId },
    data: {
      status: "PAUSED",
      pausedReason: reason,
      pausedAt: new Date(),
      nextRunAt: null,
    },
    include: { sequence: { select: { name: true } } },
  });

  await prisma.activity.create({
    data: {
      userId,
      leadId: enrollment.leadId,
      type: "SEQUENCE_PAUSED",
      summary: `Sequence "${enrollment.sequence.name}" paused`,
      detail: PAUSE_MESSAGES[reason],
      actorType: "SYSTEM",
      metadata: { reason },
    },
  });

  await audit({
    userId,
    actorType: "SYSTEM",
    action: "sequence.pause",
    entityType: "sequence_enrollment",
    entityId: enrollmentId,
    metadata: { reason },
  });

  return enrollment;
}

/**
 * Called by reply ingest and by the compliance layer. Pausing on a signal is
 * immediate and unconditional (plan §23).
 */
export async function pauseEnrollmentsForLead(
  leadId: string,
  reason: PauseReason,
  userId: string,
) {
  const active = await prisma.sequenceEnrollment.findMany({
    where: { leadId, status: "ACTIVE" },
    select: { id: true },
  });
  for (const enrollment of active) {
    await pauseEnrollment(enrollment.id, reason, userId);
  }
  return active.length;
}

export async function enrolLead(input: {
  userId: string;
  sequenceId: string;
  leadId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const sequence = await prisma.emailSequence.findFirst({
    where: { id: input.sequenceId, userId: input.userId },
    include: { steps: true },
  });
  if (!sequence) throw new Error("Sequence not found");

  const enrollment = await prisma.sequenceEnrollment.upsert({
    where: {
      sequenceId_leadId: { sequenceId: input.sequenceId, leadId: input.leadId },
    },
    create: {
      sequenceId: input.sequenceId,
      leadId: input.leadId,
      status: "ACTIVE",
      currentStep: 0,
      enrolledAt: now,
      nextRunAt: nextRunAtFor(sequence.steps, 0, now),
    },
    // Re-enrolling restarts the sequence, so day offsets must be measured from
    // this enrolment rather than the original one.
    update: {
      status: "ACTIVE",
      currentStep: 0,
      pausedReason: null,
      pausedAt: null,
      enrolledAt: now,
      nextRunAt: nextRunAtFor(sequence.steps, 0, now),
    },
  });

  await prisma.activity.create({
    data: {
      userId: input.userId,
      leadId: input.leadId,
      type: "SEQUENCE_ENROLLED",
      summary: `Enrolled in sequence "${sequence.name}"`,
      actorType: "HUMAN",
      metadata: { sequenceId: sequence.id },
    },
  });

  return enrollment;
}
