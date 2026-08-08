/**
 * The small closed vocabularies the CRM forms and list filters render as
 * `<option>`s. They were split across `server/lib/leads/schemas.ts` (where the
 * zod schemas validate against them) and `server/lib/leads/filters.ts`; both
 * modules re-export from here so the pages have one copy to read
 * (MIGRATION.md §1).
 */

export const DECISION_ROLES = [
  "CHAMPION",
  "DECISION_MAKER",
  "TECHNICAL_EVALUATOR",
  "INFLUENCER",
  "UNKNOWN",
] as const;

export const RELATIONSHIP_STATUSES = [
  "NEW",
  "CONTACTED",
  "ENGAGED",
  "MEETING_HELD",
  "DORMANT",
  "CLOSED",
] as const;

export const LEAD_SOURCE_TYPES = [
  "MANUAL",
  "CSV",
  "WEBSITE_FORM",
  "REFERRAL",
  "SEARCH_PROVIDER",
  "DIRECTORY",
  "JOB_POSTING",
  "CONFERENCE",
  "EXISTING_CONTACT",
] as const;

export const LEAD_VIEWS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active pipeline" },
  { value: "overdue", label: "Overdue next action" },
  { value: "no-next-action", label: "No next action" },
  { value: "unscored", label: "Not yet scored" },
] as const;

/** Employee-count buckets offered in the company size filter. */
export const COMPANY_SIZES = [
  { value: "1-10", label: "1-10", min: 1, max: 10 },
  { value: "11-50", label: "11-50", min: 11, max: 50 },
  { value: "51-200", label: "51-200", min: 51, max: 200 },
  { value: "201-1000", label: "201-1000", min: 201, max: 1000 },
  { value: "1001+", label: "1001+", min: 1001, max: null },
] as const;

export type CompanySizeValue = (typeof COMPANY_SIZES)[number]["value"];
