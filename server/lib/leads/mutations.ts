import { HttpError } from "~~/server/lib/api";
import { audit } from "~~/server/lib/audit";
import { prisma } from "~~/server/lib/db";
import type { ActorType, Prisma } from "~~/server/generated/prisma/client";
import type {
  CompanyInput,
  ContactInput,
  LeadInput,
  TaskInput,
} from "./schemas";

type Ctx = { userId: string; actorType?: ActorType };

async function logActivity(
  userId: string,
  data: Omit<Prisma.ActivityUncheckedCreateInput, "userId">,
) {
  await prisma.activity.create({ data: { ...data, userId } });
}

/* --------------------------------------------------------------- companies */

export async function createCompany({ userId }: Ctx, input: CompanyInput) {
  if (input.domain) {
    const clash = await prisma.company.findFirst({
      where: { userId, domain: input.domain },
      select: { id: true, deletedAt: true },
    });
    if (clash && !clash.deletedAt)
      throw new HttpError("A company with that domain already exists", 409);
    if (clash?.deletedAt) {
      // The unique index covers soft-deleted rows, so reuse instead of clashing.
      const restored = await prisma.company.update({
        where: { id: clash.id },
        data: { ...input, deletedAt: null },
      });
      await audit({ userId, action: "company.restore", entityType: "company", entityId: restored.id });
      return restored;
    }
  }

  const company = await prisma.company.create({ data: { ...input, userId } });
  await audit({
    userId,
    action: "company.create",
    entityType: "company",
    entityId: company.id,
    metadata: { name: company.name },
  });
  return company;
}

export async function updateCompany({ userId }: Ctx, id: string, input: CompanyInput) {
  const existing = await prisma.company.findFirst({
    where: { id, userId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new HttpError("Company not found", 404);

  const company = await prisma.company.update({ where: { id }, data: input });
  await audit({
    userId,
    action: "company.update",
    entityType: "company",
    entityId: id,
    metadata: { name: company.name },
  });
  return company;
}

/** Soft delete. Leads go with the company so nothing dangles in the pipeline. */
export async function deleteCompany({ userId }: Ctx, id: string) {
  const existing = await prisma.company.findFirst({
    where: { id, userId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!existing) throw new HttpError("Company not found", 404);

  const now = new Date();
  await prisma.$transaction([
    prisma.company.update({ where: { id }, data: { deletedAt: now } }),
    prisma.lead.updateMany({
      where: { companyId: id, userId, deletedAt: null },
      data: { deletedAt: now },
    }),
  ]);
  await audit({
    userId,
    action: "company.delete",
    entityType: "company",
    entityId: id,
    metadata: { name: existing.name },
  });
}

/* ---------------------------------------------------------------- contacts */

async function assertCompany(userId: string, companyId: string | null) {
  if (!companyId) return null;
  const company = await prisma.company.findFirst({
    where: { id: companyId, userId, deletedAt: null },
    select: { id: true },
  });
  if (!company) throw new HttpError("Company not found", 404);
  return company.id;
}

export async function createContact({ userId }: Ctx, input: ContactInput) {
  const companyId = await assertCompany(userId, input.companyId);
  const contact = await prisma.contact.create({
    data: { ...input, companyId, userId },
  });
  await logActivity(userId, {
    contactId: contact.id,
    companyId,
    type: "CONTACT_CREATED",
    summary: `Added contact ${contact.firstName} ${contact.lastName ?? ""}`.trim(),
  });
  await audit({
    userId,
    action: "contact.create",
    entityType: "contact",
    entityId: contact.id,
  });
  return contact;
}

export async function updateContact({ userId }: Ctx, id: string, input: ContactInput) {
  const existing = await prisma.contact.findFirst({
    where: { id, userId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new HttpError("Contact not found", 404);
  const companyId = await assertCompany(userId, input.companyId);

  const contact = await prisma.contact.update({
    where: { id },
    data: { ...input, companyId },
  });
  await audit({
    userId,
    action: "contact.update",
    entityType: "contact",
    entityId: id,
  });
  return contact;
}

export async function deleteContact({ userId }: Ctx, id: string) {
  const existing = await prisma.contact.findFirst({
    where: { id, userId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new HttpError("Contact not found", 404);

  await prisma.contact.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({
    userId,
    action: "contact.delete",
    entityType: "contact",
    entityId: id,
  });
}

/* ------------------------------------------------------------------- leads */

async function assertLeadRelations(userId: string, input: LeadInput) {
  const companyId = await assertCompany(userId, input.companyId);
  if (!companyId) throw new HttpError("A company is required", 422);

  let contactId: string | null = null;
  if (input.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: input.contactId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!contact) throw new HttpError("Contact not found", 404);
    contactId = contact.id;
  }

  let icpId: string | null = null;
  if (input.icpId) {
    const icp = await prisma.icp.findFirst({
      where: { id: input.icpId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!icp) throw new HttpError("ICP not found", 404);
    icpId = icp.id;
  }

  return { companyId, contactId, icpId };
}

export async function createLead({ userId, actorType = "HUMAN" }: Ctx, input: LeadInput) {
  const { companyId, contactId, icpId } = await assertLeadRelations(userId, input);

  const lead = await prisma.lead.create({
    data: {
      userId,
      companyId,
      contactId,
      icpId,
      stage: input.stage as Prisma.LeadCreateInput["stage"],
      sourceType: input.sourceType,
      sourceDetail: input.sourceDetail,
      estimatedValueMin: input.estimatedValueMin,
      estimatedValueMax: input.estimatedValueMax,
      nextAction: input.nextAction,
      nextActionDueAt: input.nextActionDueAt,
      lastActivityAt: new Date(),
    },
    include: { company: { select: { name: true } } },
  });

  await prisma.$transaction([
    prisma.leadStageHistory.create({
      data: { leadId: lead.id, newStage: lead.stage, reason: "Lead created", actorType },
    }),
    prisma.activity.create({
      data: {
        userId,
        leadId: lead.id,
        companyId,
        contactId,
        type: "LEAD_CREATED",
        summary: `Lead created for ${lead.company.name}`,
        actorType,
      },
    }),
  ]);

  await audit({
    userId,
    actorType,
    action: "lead.create",
    entityType: "lead",
    entityId: lead.id,
    metadata: { companyId, stage: lead.stage },
  });
  return lead;
}

/** Updates everything except the stage — stage moves go through changeLeadStage. */
export async function updateLead({ userId }: Ctx, id: string, input: LeadInput) {
  const existing = await prisma.lead.findFirst({
    where: { id, userId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new HttpError("Lead not found", 404);
  const { companyId, contactId, icpId } = await assertLeadRelations(userId, input);

  const lead = await prisma.lead.update({
    where: { id },
    data: {
      companyId,
      contactId,
      icpId,
      sourceType: input.sourceType,
      sourceDetail: input.sourceDetail,
      estimatedValueMin: input.estimatedValueMin,
      estimatedValueMax: input.estimatedValueMax,
      nextAction: input.nextAction,
      nextActionDueAt: input.nextActionDueAt,
    },
  });
  await audit({ userId, action: "lead.update", entityType: "lead", entityId: id });
  return lead;
}

export async function deleteLead({ userId }: Ctx, id: string) {
  const existing = await prisma.lead.findFirst({
    where: { id, userId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new HttpError("Lead not found", 404);

  await prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ userId, action: "lead.delete", entityType: "lead", entityId: id });
}

/** Plan §22 — the next action is the follow-up engine's unit of work. */
export async function setNextAction(
  { userId, actorType = "HUMAN" }: Ctx,
  leadId: string,
  input: { nextAction: string | null; nextActionDueAt: Date | null },
) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, userId, deletedAt: null },
    select: { id: true, companyId: true, contactId: true, nextAction: true },
  });
  if (!lead) throw new HttpError("Lead not found", 404);

  const updated = await prisma.lead.update({
    where: { id: leadId },
    data: {
      nextAction: input.nextAction,
      nextActionDueAt: input.nextAction ? input.nextActionDueAt : null,
      lastActivityAt: new Date(),
    },
  });

  await logActivity(userId, {
    leadId,
    companyId: lead.companyId,
    contactId: lead.contactId,
    type: input.nextAction ? "NEXT_ACTION_SET" : "NEXT_ACTION_CLEARED",
    summary: input.nextAction
      ? `Next action set: ${input.nextAction}`
      : `Next action cleared: ${lead.nextAction ?? "none"}`,
    actorType,
  });
  await audit({
    userId,
    actorType,
    action: "lead.next_action",
    entityType: "lead",
    entityId: leadId,
    metadata: { nextAction: input.nextAction },
  });
  return updated;
}

export async function addLeadNote(
  { userId, actorType = "HUMAN" }: Ctx,
  leadId: string,
  note: string,
) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, userId, deletedAt: null },
    select: { id: true, companyId: true, contactId: true },
  });
  if (!lead) throw new HttpError("Lead not found", 404);

  const now = new Date();
  await prisma.$transaction([
    prisma.activity.create({
      data: {
        userId,
        leadId,
        companyId: lead.companyId,
        contactId: lead.contactId,
        type: "NOTE",
        summary: note.length > 120 ? `${note.slice(0, 117)}...` : note,
        detail: note,
        actorType,
        occurredAt: now,
      },
    }),
    prisma.lead.update({ where: { id: leadId }, data: { lastActivityAt: now } }),
  ]);
}

/** Records that a human spoke to the prospect, without sending anything. */
export async function logContactMade(
  { userId, actorType = "HUMAN" }: Ctx,
  leadId: string,
  summary: string,
) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, userId, deletedAt: null },
    select: { id: true, companyId: true, contactId: true },
  });
  if (!lead) throw new HttpError("Lead not found", 404);

  const now = new Date();
  await prisma.$transaction([
    prisma.activity.create({
      data: {
        userId,
        leadId,
        companyId: lead.companyId,
        contactId: lead.contactId,
        type: "CONTACT_LOGGED",
        summary,
        actorType,
        occurredAt: now,
      },
    }),
    prisma.lead.update({
      where: { id: leadId },
      data: { lastContactedAt: now, lastActivityAt: now },
    }),
    ...(lead.contactId
      ? [
          prisma.contact.update({
            where: { id: lead.contactId },
            data: { lastInteractionAt: now },
          }),
        ]
      : []),
  ]);
  await audit({
    userId,
    actorType,
    action: "lead.contact_logged",
    entityType: "lead",
    entityId: leadId,
  });
}

/* ------------------------------------------------------------------- tasks */

export async function createTask(
  { userId, actorType = "HUMAN" }: Ctx,
  input: TaskInput,
  createdByAi = false,
) {
  let leadId: string | null = null;
  if (input.leadId) {
    const lead = await prisma.lead.findFirst({
      where: { id: input.leadId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!lead) throw new HttpError("Lead not found", 404);
    leadId = lead.id;
  }

  const task = await prisma.task.create({
    data: {
      userId,
      leadId,
      contactId: input.contactId,
      title: input.title,
      detail: input.detail,
      dueAt: input.dueAt,
      createdByAi,
    },
  });

  if (leadId) {
    await logActivity(userId, {
      leadId,
      type: "TASK_CREATED",
      summary: `Task created: ${task.title}`,
      actorType,
    });
  }
  await audit({
    userId,
    actorType,
    action: "task.create",
    entityType: "task",
    entityId: task.id,
  });
  return task;
}

export async function setTaskStatus(
  { userId, actorType = "HUMAN" }: Ctx,
  id: string,
  status: "OPEN" | "DONE" | "CANCELLED",
) {
  const existing = await prisma.task.findFirst({
    where: { id, userId },
    select: { id: true, leadId: true, title: true },
  });
  if (!existing) throw new HttpError("Task not found", 404);

  const task = await prisma.task.update({
    where: { id },
    data: { status, completedAt: status === "DONE" ? new Date() : null },
  });

  if (existing.leadId) {
    await logActivity(userId, {
      leadId: existing.leadId,
      type: `TASK_${status}`,
      summary: `Task ${status.toLowerCase()}: ${existing.title}`,
      actorType,
    });
  }
  await audit({
    userId,
    actorType,
    action: "task.status",
    entityType: "task",
    entityId: id,
    metadata: { status },
  });
  return task;
}

export async function deleteTask({ userId }: Ctx, id: string) {
  const existing = await prisma.task.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) throw new HttpError("Task not found", 404);
  await prisma.task.delete({ where: { id } });
  await audit({ userId, action: "task.delete", entityType: "task", entityId: id });
}
