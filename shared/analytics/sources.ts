import type { LeadSourceType } from "~~/server/generated/prisma/client";

/**
 * Lead-source labels, moved out of `server/lib/analytics/acquisition.ts` so the
 * acquisition breakdown can be labelled in the browser (MIGRATION.md §1).
 * `acquisition.ts` re-exports this.
 */
export const SOURCE_LABELS: Record<LeadSourceType, string> = {
  MANUAL: "Manual entry",
  CSV: "CSV import",
  WEBSITE_FORM: "Website form",
  REFERRAL: "Referral",
  SEARCH_PROVIDER: "Search provider",
  DIRECTORY: "Directory",
  JOB_POSTING: "Job posting",
  CONFERENCE: "Conference",
  EXISTING_CONTACT: "Existing contact",
};
