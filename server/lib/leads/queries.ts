import { prisma } from "~~/server/lib/db";
import type { LeadStage, Prisma } from "~~/server/generated/prisma/client";
import {
  buildCompanyOrderBy,
  buildCompanyWhere,
  buildContactOrderBy,
  buildContactWhere,
  buildLeadOrderBy,
  buildLeadWhere,
  buildTaskWhere,
  type CompanyFilters,
  type ContactFilters,
  type LeadFilters,
  type TaskFilters,
} from "./filters";

/* --------------------------------------------------------------- companies */

const COMPANY_LIST_SELECT = {
  id: true,
  name: true,
  domain: true,
  website: true,
  industry: true,
  location: true,
  employeeCount: true,
  sizeLabel: true,
  updatedAt: true,
  _count: { select: { contacts: true, leads: true } },
} satisfies Prisma.CompanySelect;

/**
 * `take` is a parameter rather than the literal 200 the source used because the
 * same rows now serve the form pickers, which `companyOptions` fed with 500.
 * The default is unchanged, so every existing caller behaves as before.
 */
export async function listCompanies(
  userId: string,
  filters: CompanyFilters,
  take = 200,
) {
  return prisma.company.findMany({
    where: buildCompanyWhere(userId, filters),
    orderBy: buildCompanyOrderBy(filters),
    select: COMPANY_LIST_SELECT,
    take,
  });
}

export type CompanyListRow = Awaited<ReturnType<typeof listCompanies>>[number];

/** Distinct industries already in use, for the list filter. */
export async function companyIndustries(userId: string) {
  const rows = await prisma.company.findMany({
    where: { userId, deletedAt: null, industry: { not: null } },
    select: { industry: true },
    distinct: ["industry"],
    orderBy: { industry: "asc" },
  });
  return rows.map((r) => r.industry).filter((v): v is string => Boolean(v));
}

export async function getCompany(userId: string, id: string) {
  return prisma.company.findFirst({
    where: { id, userId, deletedAt: null },
    include: {
      contacts: {
        where: { deletedAt: null },
        orderBy: [{ influenceScore: "desc" }, { firstName: "asc" }],
      },
      leads: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: { contact: { select: { firstName: true, lastName: true } } },
      },
      activities: { orderBy: { occurredAt: "desc" }, take: 20 },
    },
  });
}

export type CompanyDetail = NonNullable<Awaited<ReturnType<typeof getCompany>>>;

/** Lightweight options list used by the contact and lead forms. */
export async function companyOptions(userId: string) {
  return prisma.company.findMany({
    where: { userId, deletedAt: null },
    select: { id: true, name: true, domain: true },
    orderBy: { name: "asc" },
    take: 500,
  });
}

/* ---------------------------------------------------------------- contacts */

/** `take` is a parameter for the same reason as `listCompanies` above. */
export async function listContacts(
  userId: string,
  filters: ContactFilters,
  take = 200,
) {
  return prisma.contact.findMany({
    where: buildContactWhere(userId, filters),
    orderBy: buildContactOrderBy(filters),
    include: {
      company: { select: { id: true, name: true } },
      _count: { select: { leads: true } },
    },
    take,
  });
}

export type ContactListRow = Awaited<ReturnType<typeof listContacts>>[number];

export async function getContact(userId: string, id: string) {
  return prisma.contact.findFirst({
    where: { id, userId, deletedAt: null },
    include: {
      company: { select: { id: true, name: true, industry: true } },
      leads: {
        where: { deletedAt: null },
        include: { company: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
      activities: { orderBy: { occurredAt: "desc" }, take: 20 },
      tasks: { where: { status: "OPEN" }, orderBy: { dueAt: "asc" } },
    },
  });
}

export type ContactDetail = NonNullable<Awaited<ReturnType<typeof getContact>>>;

/** Contacts belonging to a company (or unassigned), for lead assignment. */
export async function contactOptions(userId: string, companyId?: string | null) {
  return prisma.contact.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(companyId ? { companyId } : {}),
    },
    select: { id: true, firstName: true, lastName: true, companyId: true, title: true },
    orderBy: [{ firstName: "asc" }],
    take: 500,
  });
}

/* ------------------------------------------------------------------- leads */

const LEAD_LIST_INCLUDE = {
  company: { select: { id: true, name: true, domain: true, industry: true } },
  contact: { select: { id: true, firstName: true, lastName: true, email: true } },
  icp: { select: { id: true, name: true } },
} satisfies Prisma.LeadInclude;

export async function listLeads(
  userId: string,
  filters: LeadFilters,
  now: Date = new Date(),
) {
  return prisma.lead.findMany({
    where: buildLeadWhere(userId, filters, now),
    orderBy: buildLeadOrderBy(filters),
    include: LEAD_LIST_INCLUDE,
    take: 200,
  });
}

export type LeadListRow = Awaited<ReturnType<typeof listLeads>>[number];

export async function countLeads(
  userId: string,
  filters: LeadFilters,
  now: Date = new Date(),
) {
  return prisma.lead.count({ where: buildLeadWhere(userId, filters, now) });
}

/** Board data: every lead that sits in a visible pipeline column. */
export async function leadsByStage(userId: string, stages: LeadStage[]) {
  const leads = await prisma.lead.findMany({
    where: { userId, deletedAt: null, stage: { in: stages } },
    orderBy: [{ overallScore: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
    include: LEAD_LIST_INCLUDE,
    take: 500,
  });

  const grouped = new Map<LeadStage, LeadListRow[]>();
  for (const stage of stages) grouped.set(stage, []);
  for (const lead of leads) grouped.get(lead.stage)?.push(lead);
  return grouped;
}

export async function getLead(userId: string, id: string) {
  return prisma.lead.findFirst({
    where: { id, userId, deletedAt: null },
    include: {
      company: true,
      contact: true,
      icp: { select: { id: true, name: true } },
      scores: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

export type LeadDetail = NonNullable<Awaited<ReturnType<typeof getLead>>>;

/** Everything the Overview tab renders in one round trip. */
export async function getLeadOverview(userId: string, leadId: string) {
  const [activities, tasks, stageHistory, contacts, opportunityCount, researchCount] =
    await Promise.all([
      prisma.activity.findMany({
        where: { userId, leadId },
        orderBy: { occurredAt: "desc" },
        take: 8,
      }),
      prisma.task.findMany({
        where: { userId, leadId, status: "OPEN" },
        orderBy: [{ dueAt: "asc" }],
        take: 8,
      }),
      prisma.leadStageHistory.findMany({
        where: { leadId },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.contact.findMany({
        where: { userId, deletedAt: null, leads: { some: { id: leadId } } },
        orderBy: { influenceScore: "desc" },
      }),
      prisma.opportunity.count({ where: { leadId } }),
      prisma.researchReport.count({ where: { leadId } }),
    ]);

  return {
    activities,
    tasks,
    stageHistory,
    contacts,
    opportunityCount,
    researchCount,
  };
}

export async function listLeadActivities(userId: string, leadId: string) {
  return prisma.activity.findMany({
    where: { userId, leadId },
    orderBy: { occurredAt: "desc" },
    take: 200,
  });
}

export async function listLeadStageHistory(leadId: string) {
  return prisma.leadStageHistory.findMany({
    where: { leadId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * People attached to a lead: the primary contact plus everyone else at the
 * company, since contacts are stored independently of the lead (plan §14).
 */
export async function listLeadPeople(userId: string, lead: {
  id: string;
  companyId: string;
  contactId: string | null;
}) {
  return prisma.contact.findMany({
    where: {
      userId,
      deletedAt: null,
      OR: [{ companyId: lead.companyId }, { id: lead.contactId ?? "" }],
    },
    orderBy: [{ influenceScore: "desc" }, { firstName: "asc" }],
  });
}

export async function icpOptions(userId: string) {
  return prisma.icp.findMany({
    where: { userId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/* ------------------------------------------------------------------- tasks */

export async function listTasks(userId: string, filters: TaskFilters) {
  return prisma.task.findMany({
    where: buildTaskWhere(userId, filters),
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    include: {
      lead: {
        select: { id: true, stage: true, company: { select: { id: true, name: true } } },
      },
      contact: { select: { id: true, firstName: true, lastName: true } },
    },
    take: 300,
  });
}

export type TaskListRow = Awaited<ReturnType<typeof listTasks>>[number];

/** Plan §22 — the lead-level next action is a first-class follow-up item. */
export async function listNextActions(userId: string) {
  return prisma.lead.findMany({
    where: { userId, deletedAt: null, nextAction: { not: null } },
    select: {
      id: true,
      stage: true,
      nextAction: true,
      nextActionDueAt: true,
      company: { select: { id: true, name: true } },
    },
    orderBy: [{ nextActionDueAt: { sort: "asc", nulls: "last" } }],
    take: 300,
  });
}

export type NextActionRow = Awaited<ReturnType<typeof listNextActions>>[number];

export async function getTask(userId: string, id: string) {
  return prisma.task.findFirst({ where: { id, userId } });
}
