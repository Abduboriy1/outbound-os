import { z } from "zod";
import type { LeadStage, Prisma } from "~~/server/generated/prisma/client";
import { isKnownStage } from "./stage-rules";
import { COMPANY_SIZES, LEAD_VIEWS } from "~~/shared/leads/enums";

/* ------------------------------------------------------------------ shared */

const trimmed = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Next hands page search params as string or string[]; the schemas want strings. */
export function flattenParams(params: RawSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    out[key] = Array.isArray(value) ? value.join(",") : value;
  }
  return out;
}

/** Splits a repeated filter value that arrives as `a,b,c` in the query string. */
export function splitList(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function contains(value: string): Prisma.StringFilter {
  return { contains: value, mode: "insensitive" };
}

/* --------------------------------------------------------------- companies */

/**
 * The closed vocabularies moved to `shared/leads/enums.ts` so the list filters
 * can render them without importing `server/lib` (MIGRATION.md §1).
 */
export { COMPANY_SIZES, LEAD_VIEWS };
export type { CompanySizeValue } from "~~/shared/leads/enums";

export const companyFiltersSchema = z.object({
  q: trimmed,
  industry: trimmed,
  size: trimmed,
  sort: z.enum(["name", "created", "updated"]).catch("name").default("name"),
  dir: z.enum(["asc", "desc"]).catch("asc").default("asc"),
});

export type CompanyFilters = z.infer<typeof companyFiltersSchema>;

export function buildCompanyWhere(
  userId: string,
  filters: CompanyFilters,
): Prisma.CompanyWhereInput {
  const where: Prisma.CompanyWhereInput = { userId, deletedAt: null };

  if (filters.q) {
    where.OR = [
      { name: contains(filters.q) },
      { domain: contains(filters.q) },
      { location: contains(filters.q) },
    ];
  }
  if (filters.industry) where.industry = contains(filters.industry);

  const bucket = COMPANY_SIZES.find((s) => s.value === filters.size);
  if (bucket) {
    where.employeeCount =
      bucket.max == null ? { gte: bucket.min } : { gte: bucket.min, lte: bucket.max };
  }

  return where;
}

export function buildCompanyOrderBy(
  filters: CompanyFilters,
): Prisma.CompanyOrderByWithRelationInput {
  if (filters.sort === "created") return { createdAt: filters.dir };
  if (filters.sort === "updated") return { updatedAt: filters.dir };
  return { name: filters.dir };
}

/* ---------------------------------------------------------------- contacts */

export const contactFiltersSchema = z.object({
  q: trimmed,
  companyId: trimmed,
  decisionRole: trimmed,
  relationshipStatus: trimmed,
  sort: z.enum(["name", "influence", "interaction"]).catch("name").default("name"),
  dir: z.enum(["asc", "desc"]).catch("asc").default("asc"),
});

export type ContactFilters = z.infer<typeof contactFiltersSchema>;

export function buildContactWhere(
  userId: string,
  filters: ContactFilters,
): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = { userId, deletedAt: null };

  if (filters.q) {
    where.OR = [
      { firstName: contains(filters.q) },
      { lastName: contains(filters.q) },
      { email: contains(filters.q) },
      { title: contains(filters.q) },
      { company: { name: contains(filters.q) } },
    ];
  }
  if (filters.companyId) where.companyId = filters.companyId;
  if (filters.decisionRole)
    where.decisionRole = filters.decisionRole as Prisma.ContactWhereInput["decisionRole"];
  if (filters.relationshipStatus)
    where.relationshipStatus = filters.relationshipStatus;

  return where;
}

export function buildContactOrderBy(
  filters: ContactFilters,
): Prisma.ContactOrderByWithRelationInput[] {
  if (filters.sort === "influence")
    return [{ influenceScore: filters.dir }, { firstName: "asc" }];
  if (filters.sort === "interaction")
    return [{ lastInteractionAt: filters.dir }, { firstName: "asc" }];
  return [{ firstName: filters.dir }, { lastName: filters.dir }];
}

/* ------------------------------------------------------------------- leads */

/* LEAD_VIEWS now lives in `shared/leads/enums.ts`; re-exported above. */

export const leadFiltersSchema = z.object({
  q: trimmed,
  /** Comma separated list of stages. */
  stage: trimmed,
  icpId: trimmed,
  source: trimmed,
  minScore: z.coerce.number().int().min(0).max(100).optional().catch(undefined),
  view: z
    .enum(["all", "active", "overdue", "no-next-action", "unscored"])
    .catch("all")
    .default("all"),
  sort: z
    .enum(["score", "value", "updated", "created", "due", "company", "stage"])
    .catch("score")
    .default("score"),
  dir: z.enum(["asc", "desc"]).catch("desc").default("desc"),
});

export type LeadFilters = z.infer<typeof leadFiltersSchema>;

/** Stages a lead sits in while it is still worth working. */
export const ACTIVE_LEAD_STAGES: LeadStage[] = [
  "PROSPECT",
  "RESEARCHING",
  "QUALIFIED",
  "READY_FOR_OUTREACH",
  "CONTACTED",
  "RESPONDED",
  "DISCOVERY",
  "OPPORTUNITY",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "FOLLOW_UP_LATER",
];

export function parseStages(value?: string | null): LeadStage[] {
  return splitList(value).filter(isKnownStage);
}

export function buildLeadWhere(
  userId: string,
  filters: LeadFilters,
  now: Date = new Date(),
): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { userId, deletedAt: null };

  const stages = parseStages(filters.stage);
  if (stages.length) where.stage = { in: stages };

  if (filters.icpId) where.icpId = filters.icpId;
  if (filters.source)
    where.sourceType = filters.source as Prisma.LeadWhereInput["sourceType"];
  if (filters.minScore != null) where.overallScore = { gte: filters.minScore };

  if (filters.q) {
    where.OR = [
      { company: { name: contains(filters.q) } },
      { company: { domain: contains(filters.q) } },
      { contact: { firstName: contains(filters.q) } },
      { contact: { lastName: contains(filters.q) } },
      { contact: { email: contains(filters.q) } },
    ];
  }

  switch (filters.view) {
    case "active":
      // An explicit stage filter is the more specific instruction; keep it.
      if (!stages.length) where.stage = { in: ACTIVE_LEAD_STAGES };
      break;
    case "overdue":
      where.nextActionDueAt = { lt: now };
      break;
    case "no-next-action":
      where.nextAction = null;
      if (!stages.length) where.stage = { in: ACTIVE_LEAD_STAGES };
      break;
    case "unscored":
      where.overallScore = null;
      break;
    default:
      break;
  }

  return where;
}

export function buildLeadOrderBy(
  filters: LeadFilters,
): Prisma.LeadOrderByWithRelationInput[] {
  const dir = filters.dir;
  switch (filters.sort) {
    case "value":
      return [{ estimatedValueMax: { sort: dir, nulls: "last" } }, { createdAt: "desc" }];
    case "updated":
      return [{ updatedAt: dir }];
    case "created":
      return [{ createdAt: dir }];
    case "due":
      return [{ nextActionDueAt: { sort: dir, nulls: "last" } }, { createdAt: "desc" }];
    case "company":
      return [{ company: { name: dir } }];
    case "stage":
      return [{ stage: dir }, { overallScore: { sort: "desc", nulls: "last" } }];
    default:
      return [{ overallScore: { sort: dir, nulls: "last" } }, { createdAt: "desc" }];
  }
}

/* ------------------------------------------------------------------- tasks */

export const taskFiltersSchema = z.object({
  status: z.enum(["OPEN", "DONE", "CANCELLED", "ALL"]).catch("OPEN").default("OPEN"),
  leadId: trimmed,
  q: trimmed,
});

export type TaskFilters = z.infer<typeof taskFiltersSchema>;

export function buildTaskWhere(
  userId: string,
  filters: TaskFilters,
): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = { userId };
  if (filters.status !== "ALL")
    where.status = filters.status as Prisma.TaskWhereInput["status"];
  if (filters.leadId) where.leadId = filters.leadId;
  if (filters.q) where.title = contains(filters.q);
  return where;
}

/* ------------------------------------------------------------ due grouping */

/**
 * Due-date bucketing moved to `shared/leads/due.ts` so the task list and the
 * lead workspace share one implementation (MIGRATION.md §1).
 */
export { BUCKET_LABELS, BUCKET_ORDER, dueBucket, groupByDue } from "~~/shared/leads/due";
export type { DueBucket, DueGroups } from "~~/shared/leads/due";
