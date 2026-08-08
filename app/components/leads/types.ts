/**
 * Shapes shared by the leads/people/companies pages.
 *
 * Two things differ from the React source's types, both forced by the move from
 * server components to HTTP:
 *
 * 1. Dates arrive as ISO strings over JSON, so every timestamp is
 *    `Date | string`. `relativeTime`, `formatDate` and `toDate` all take both.
 * 2. `FormAction` receives a plain `Record<string, string>` rather than
 *    `FormData`. Server actions do not exist (MIGRATION.md §2.3); the value
 *    object is exactly what `formToObject` used to hand the zod schemas, so the
 *    endpoints accept it unchanged.
 */
import type {
  ActorType,
  DecisionRole,
  LeadStage,
  TaskStatus,
} from "~~/server/generated/prisma/client";

export type DateLike = Date | string;

/** Port of `FormState` from `src/lib/leads/form-state.ts`. */
export type FormState = { error?: string; ok?: boolean } | undefined;

export type FormValues = Record<string, string>;

/** Port of `FormAction`: the submit handler a form component is given. */
export type FormAction = (values: FormValues) => Promise<FormState>;

/** Port of `SimpleAction`: used where the source returned no state. */
export type SimpleAction = (values: FormValues) => Promise<void>;

export type Option = { value: string; label: string };

/** Port of `ActivityRow` from `src/components/leads/display.tsx`. */
export type ActivityRow = {
  id: string;
  type: string;
  summary: string;
  detail: string | null;
  actorType: ActorType;
  occurredAt: DateLike;
};

/** Port of `BoardLead` from `src/components/leads/display.tsx`. */
export type BoardLead = {
  id: string;
  stage: LeadStage;
  overallScore: number | null;
  estimatedValueMin: number | null;
  estimatedValueMax: number | null;
  nextAction: string | null;
  nextActionDueAt: DateLike | null;
  company: { id: string; name: string };
  contact: { firstName: string; lastName: string | null } | null;
};

/** Port of `TaskRow` from `src/components/leads/tasks.tsx`. */
export type TaskRow = {
  id: string;
  title: string;
  detail: string | null;
  dueAt: DateLike | null;
  status: TaskStatus;
  createdByAi: boolean;
  lead?: { id: string; company: { id: string; name: string } } | null;
};

/** Port of `CompanyDefaults` from `src/components/leads/forms.tsx`. */
export type CompanyDefaults = {
  id?: string;
  name?: string;
  domain?: string;
  website?: string;
  industry?: string;
  location?: string;
  employeeCount?: string;
  sizeLabel?: string;
  linkedinUrl?: string;
  phone?: string;
  description?: string;
};

/** Port of `ContactDefaults` from `src/components/leads/forms.tsx`. */
export type ContactDefaults = {
  id?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  companyId?: string;
  decisionRole?: string;
  influenceScore?: string;
  relationshipStatus?: string;
  lastInteractionAt?: string;
  notes?: string;
};

/** The reactive value object `LeadFields.vue` binds into. */
export type LeadFieldValues = {
  companyId: string;
  contactId: string;
  stage: string;
  icpId: string;
  sourceType: string;
  sourceDetail: string;
  estimatedValueMin: string;
  estimatedValueMax: string;
  nextAction: string;
  nextActionDueAt: string;
};

/** Port of `LeadDefaults` from `src/components/leads/forms.tsx`. */
export type LeadDefaults = {
  id?: string;
  companyId?: string;
  contactId?: string;
  icpId?: string;
  stage?: string;
  sourceType?: string;
  sourceDetail?: string;
  estimatedValueMin?: string;
  estimatedValueMax?: string;
  nextAction?: string;
  nextActionDueAt?: string;
};

/* ------------------------------------------------- API response row shapes */

export type CompanyOption = { id: string; name: string; domain?: string | null };

export type ContactOption = {
  id: string;
  firstName: string;
  lastName: string | null;
  companyId?: string | null;
  title?: string | null;
};

export type IcpOption = { id: string; name: string };

export type DecisionRoleValue = DecisionRole;
