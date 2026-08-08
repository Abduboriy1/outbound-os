/**
 * Response shapes for the endpoints the leads/people/companies pages read.
 *
 * Every one mirrors the `select`/`include` in `server/lib/leads/queries.ts`, so
 * they are the Prisma row types narrowed to what the query actually returns.
 * Prisma's types are imported **as types only** (MIGRATION.md §5.4), which is
 * erased at build time and pulls nothing into the client bundle.
 *
 * Caveat: Prisma types every timestamp as `Date`, but JSON has no date type, so
 * at runtime these fields hold ISO strings. `relativeTime`, `formatDate` and
 * `toDate` all accept either.
 */
import type {
  Activity,
  Company,
  Contact,
  Lead,
  LeadScore,
  LeadStage,
  LeadStageHistory,
  Task,
} from "~~/server/generated/prisma/client";

/** `listLeads` — `LEAD_LIST_INCLUDE`. */
export type LeadListRow = Lead & {
  company: Pick<Company, "id" | "name" | "domain" | "industry">;
  contact: Pick<Contact, "id" | "firstName" | "lastName" | "email"> | null;
  icp: { id: string; name: string } | null;
};

/** `GET /api/leads`. */
export type LeadListResponse = { leads: LeadListRow[]; total: number };

/** `getLead`. */
export type LeadDetail = Lead & {
  company: Company;
  contact: Contact | null;
  icp: { id: string; name: string } | null;
  scores: LeadScore[];
};

/** `GET /api/leads/:id` — `{ lead, ...getLeadOverview() }`. */
export type LeadDetailResponse = {
  lead: LeadDetail;
  activities: Activity[];
  tasks: Task[];
  stageHistory: LeadStageHistory[];
  contacts: Contact[];
  opportunityCount: number;
  researchCount: number;
};

/** `listCompanies` — `COMPANY_LIST_SELECT`. */
export type CompanyListRow = Pick<
  Company,
  | "id"
  | "name"
  | "domain"
  | "website"
  | "industry"
  | "location"
  | "employeeCount"
  | "sizeLabel"
  | "updatedAt"
> & { _count: { contacts: number; leads: number } };

/** `getCompany`. */
export type CompanyDetail = Company & {
  contacts: Contact[];
  leads: (Lead & { contact: Pick<Contact, "firstName" | "lastName"> | null })[];
  activities: Activity[];
};

/** `listContacts`. */
export type ContactListRow = Contact & {
  company: Pick<Company, "id" | "name"> | null;
  _count: { leads: number };
};

/** `getContact`. */
export type ContactDetail = Contact & {
  company: Pick<Company, "id" | "name" | "industry"> | null;
  leads: (Lead & { company: Pick<Company, "id" | "name"> })[];
  activities: Activity[];
  tasks: Task[];
};

/** `listTasks`. */
export type TaskListRow = Task & {
  lead: { id: string; stage: LeadStage; company: { id: string; name: string } } | null;
  contact: Pick<Contact, "id" | "firstName" | "lastName"> | null;
};

/** `GET /api/icps` — only the two fields the option lists need. */
export type IcpRow = { id: string; name: string };
