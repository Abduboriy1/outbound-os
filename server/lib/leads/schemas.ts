import { z } from "zod";
import { ALL_STAGES } from "./stage-rules";
import {
  DECISION_ROLES,
  LEAD_SOURCE_TYPES,
  RELATIONSHIP_STATUSES,
} from "~~/shared/leads/enums";

/* ----------------------------------------------------------------- helpers */

/** Form fields arrive as empty strings; the database wants null. */
const optionalText = z.preprocess(
  (v) => (v == null || (typeof v === "string" && v.trim() === "") ? null : v),
  z.string().trim().nullable().default(null),
);

const optionalInt = z.preprocess(
  (v) => (v == null || (typeof v === "string" && v.trim() === "") ? null : Number(v)),
  z.number().int().nullable().default(null),
);

const optionalDate = z.preprocess(
  (v) =>
    v == null || (typeof v === "string" && v.trim() === "")
      ? null
      : v instanceof Date
        ? v
        : new Date(String(v)),
  z.date().nullable().default(null),
);

const requiredText = z.string().trim().min(1, "Required");

/**
 * Moved to `shared/leads/enums.ts` so the forms can render the same option
 * lists the schemas validate against (MIGRATION.md §1).
 */
export { DECISION_ROLES, LEAD_SOURCE_TYPES, RELATIONSHIP_STATUSES };

const stageEnum = z.enum(ALL_STAGES as [string, ...string[]]);

/* --------------------------------------------------------------- companies */

export const companyInputSchema = z.object({
  name: requiredText.max(200, "Name is too long"),
  domain: optionalText,
  website: optionalText,
  industry: optionalText,
  location: optionalText,
  employeeCount: optionalInt,
  sizeLabel: optionalText,
  description: optionalText,
  linkedinUrl: optionalText,
  phone: optionalText,
});

export type CompanyInput = z.infer<typeof companyInputSchema>;

/* ---------------------------------------------------------------- contacts */

export const contactInputSchema = z.object({
  firstName: requiredText.max(120),
  lastName: optionalText,
  title: optionalText,
  email: optionalText,
  phone: optionalText,
  linkedinUrl: optionalText,
  companyId: optionalText,
  decisionRole: z.enum(DECISION_ROLES).default("UNKNOWN"),
  influenceScore: z.coerce.number().int().min(0).max(100).default(0),
  relationshipStatus: z.string().trim().min(1).default("NEW"),
  lastInteractionAt: optionalDate,
  notes: optionalText,
});

export type ContactInput = z.infer<typeof contactInputSchema>;

/* ------------------------------------------------------------------- leads */

export const leadInputSchema = z.object({
  companyId: requiredText,
  contactId: optionalText,
  icpId: optionalText,
  stage: stageEnum.default("PROSPECT"),
  sourceType: z.enum(LEAD_SOURCE_TYPES).default("MANUAL"),
  sourceDetail: optionalText,
  estimatedValueMin: optionalInt,
  estimatedValueMax: optionalInt,
  nextAction: optionalText,
  nextActionDueAt: optionalDate,
});

export type LeadInput = z.infer<typeof leadInputSchema>;

/** Create a company, an optional first contact, and a lead in one submission. */
export const quickLeadSchema = z.object({
  company: companyInputSchema,
  contact: contactInputSchema.partial({ firstName: true }).optional(),
  lead: leadInputSchema.omit({ companyId: true, contactId: true }),
});

export const leadStageChangeSchema = z.object({
  stage: stageEnum,
  reason: optionalText,
});

export const nextActionSchema = z.object({
  nextAction: optionalText,
  nextActionDueAt: optionalDate,
});

/* ------------------------------------------------------------------- tasks */

export const taskInputSchema = z.object({
  title: requiredText.max(300),
  detail: optionalText,
  dueAt: optionalDate,
  leadId: optionalText,
  contactId: optionalText,
});

export type TaskInput = z.infer<typeof taskInputSchema>;

export const taskStatusSchema = z.object({
  status: z.enum(["OPEN", "DONE", "CANCELLED"]),
});

/* ------------------------------------------------------- form-data reading */

/**
 * Server actions receive FormData; route handlers receive JSON. Both funnel
 * through the same schemas, so form submissions are flattened first.
 */
export function formToObject(formData: FormData, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (prefix) {
      if (!key.startsWith(prefix)) continue;
      out[key.slice(prefix.length)] = value;
    } else {
      out[key] = value;
    }
  }
  return out;
}
