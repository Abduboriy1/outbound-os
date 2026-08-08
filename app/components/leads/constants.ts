/**
 * Constants the leads/people/companies UI needs at runtime.
 *
 * These were duplicated from `server/lib/stages.ts`,
 * `server/lib/leads/schemas.ts` and `server/lib/leads/filters.ts` because
 * MIGRATION.md §1 forbids a page or component importing from
 * `~~/server/lib/**` at runtime. They now have one definition each under
 * `shared/`, which both sides import; this re-export keeps the
 * `~/components/leads/constants` path the pages already use.
 */
export {
  ALL_STAGES,
  OFF_PIPELINE_STAGES,
  PIPELINE_STAGES,
  STAGE_LABELS,
  STAGE_TONES,
} from "~~/shared/stages";

export {
  COMPANY_SIZES,
  DECISION_ROLES,
  LEAD_SOURCE_TYPES,
  LEAD_VIEWS,
  RELATIONSHIP_STATUSES,
} from "~~/shared/leads/enums";
export type { CompanySizeValue } from "~~/shared/leads/enums";

/** `SOME_ENUM_VALUE` → `some enum value`, as every list page does inline. */
export const humanise = (value: string) => value.replace(/_/g, " ").toLowerCase();
