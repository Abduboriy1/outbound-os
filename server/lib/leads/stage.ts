import { HttpError } from "~~/server/lib/api";
import { audit } from "~~/server/lib/audit";
import { prisma } from "~~/server/lib/db";
import { STAGE_LABELS } from "~~/shared/stages";
import type { ActorType, Lead, LeadStage } from "~~/server/generated/prisma/client";
import { checkStageTransition, stageSideEffects } from "./stage-rules";

export type StageChangeInput = {
  userId: string;
  leadId: string;
  toStage: string;
  reason?: string | null;
  actorType?: ActorType;
  /** Which agent or user id initiated the move, for the history row. */
  actorId?: string | null;
};

export type StageChangeResult = {
  lead: Lead;
  previousStage: LeadStage;
  changed: boolean;
};

/**
 * The only supported way to move a lead between stages. Every path — board,
 * workspace, REST, background jobs — goes through here so the history, the
 * activity feed and the audit log can never disagree with the lead row
 * (plan §4).
 */
export async function changeLeadStage(
  input: StageChangeInput,
): Promise<StageChangeResult> {
  const { userId, leadId, actorType = "HUMAN", actorId = null } = input;
  const reason = input.reason?.trim() || null;

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, userId, deletedAt: null },
  });
  if (!lead) throw new HttpError("Lead not found", 404);

  const check = checkStageTransition({ from: lead.stage, to: input.toStage, reason });
  if (!check.ok) {
    // Re-selecting the current stage is a no-op, not a user error.
    if (check.code === "no_change")
      return { lead, previousStage: lead.stage, changed: false };
    throw new HttpError(check.message, check.code === "unknown_stage" ? 422 : 409);
  }

  const toStage = input.toStage as LeadStage;
  const previousStage = lead.stage;
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.lead.update({
      where: { id: lead.id },
      data: {
        stage: toStage,
        lastActivityAt: now,
        ...stageSideEffects(toStage, now, reason),
      },
    });

    await tx.leadStageHistory.create({
      data: {
        leadId: lead.id,
        previousStage,
        newStage: toStage,
        reason,
        actorType,
        actorId,
      },
    });

    await tx.activity.create({
      data: {
        userId,
        leadId: lead.id,
        companyId: lead.companyId,
        contactId: lead.contactId,
        type: "STAGE_CHANGE",
        summary: `Stage changed from ${STAGE_LABELS[previousStage]} to ${STAGE_LABELS[toStage]}`,
        detail: reason,
        actorType,
        metadata: { previousStage, newStage: toStage },
        occurredAt: now,
      },
    });

    return next;
  });

  await audit({
    userId,
    actorType,
    action: "lead.stage_change",
    entityType: "lead",
    entityId: lead.id,
    metadata: { previousStage, newStage: toStage, reason },
  });

  return { lead: updated, previousStage, changed: true };
}
