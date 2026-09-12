/**
 * Wire shapes for the research screens: what the API actually returns, with
 * every `Date` narrowed to the `string` that survives JSON.
 */

import type { ClaimType, ResearchStatus } from "~~/server/generated/prisma/client";
import type { DetectedSignal } from "~~/server/lib/research/signals";
import type { ScoringWeights } from "~~/shared/scoring/weights";

export type { DetectedSignal };

/* --------------------------------------------------------------- ICPs */

export type IcpRule = {
  field: string;
  operator: string;
  value: string;
  weight: number;
};

/** `GET /api/icps` — includes the rules and the lead count. */
export type IcpListRow = {
  id: string;
  name: string;
  description: string | null;
  industries: string[];
  geographies: string[];
  problems: string[];
  targetRoles: string[];
  minEmployees: number | null;
  maxEmployees: number | null;
  minDealSize: number | null;
  maxDealSize: number | null;
  isDefault: boolean;
  weights: unknown;
  rules: IcpRule[];
  _count: { leads: number };
};

/** `GET /api/icps/:id`. */
export type IcpDetail = Omit<IcpListRow, "_count">;

/** The form model the editor holds. */
export type IcpEditorValues = {
  id?: string;
  name: string;
  description: string;
  industries: string[];
  geographies: string[];
  problems: string[];
  targetRoles: string[];
  minEmployees: number | null;
  maxEmployees: number | null;
  minDealSize: number | null;
  maxDealSize: number | null;
  isDefault: boolean;
  weights: ScoringWeights;
  rules: IcpRule[];
};

/** What the interview hands back to the editor. */
export type IcpDraftValues = {
  name: string;
  description: string;
  industries: string[];
  geographies: string[];
  problems: string[];
  targetRoles: string[];
  minEmployees: number | null;
  maxEmployees: number | null;
  minDealSize: number | null;
  maxDealSize: number | null;
};

/** `POST /api/icps/interview` → `{ data: { draft } }`, in the agent's snake_case. */
export type ApiDraft = {
  name: string;
  description: string;
  industries: string[];
  geographies: string[];
  problems: string[];
  target_roles: string[];
  min_employees: number | null;
  max_employees: number | null;
  min_deal_size: number | null;
  max_deal_size: number | null;
  disqualifiers: string[];
  rationale: string;
  open_questions: string[];
};

/* ------------------------------------------------------------ reports */

/**
 * One row of `GET /api/research`. `signals` and `opportunities` are counts here,
 * not the lists. `signalDetails` is the list, and is present only when the
 * request asked for `include=signals`.
 */
export type ResearchListRow = {
  id: string;
  leadId: string;
  status: ResearchStatus;
  summary: string | null;
  confidence: number | null;
  model: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  company: { id: string; name: string; domain: string | null };
  _count: { claims: number; sources: number };
  signals: number;
  opportunities: number;
  /** Contacts the run created or enriched — the People tab's gain. */
  people: number;
  warnings: string[];
  signalDetails?: DetectedSignal[];
};

/** One step of a run's live log (`ResearchReport.progress`). */
export type ResearchProgressEvent = {
  at: string;
  section: "company" | "people";
  stage: string;
  status: "started" | "done" | "warning" | "failed";
  label: string;
  detail?: string;
};

/** What people discovery wrote to the People tab. */
export type ResearchPeopleSummary = {
  found: number;
  created: { id: string; name: string; email: string | null }[];
  enriched: { id: string; name: string; email: string }[];
  matched?: number;
  phones?: { number: string; kind: "phone" | "fax"; sourceUrl: string | null }[];
};

export type ResearchClaim = {
  id: string;
  sourceId: string | null;
  type: ClaimType;
  category: string | null;
  text: string;
  confidence: number;
  createdAt: string;
};

export type ResearchSource = {
  id: string;
  kind: string;
  url: string | null;
  title: string | null;
  snippet: string | null;
  retrievedAt: string;
};

/** `GET /api/research/:reportId`. */
export type ResearchReportDetail = {
  id: string;
  leadId: string;
  status: ResearchStatus;
  summary: string | null;
  confidence: number | null;
  model: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  company: {
    id: string;
    name: string;
    domain: string | null;
    website: string | null;
  };
  sources: ResearchSource[];
  claims: ResearchClaim[];
  claimsByType: Record<ClaimType, ResearchClaim[]>;
  signals: DetectedSignal[];
  opportunities: unknown[];
  warnings: string[];
  progress: ResearchProgressEvent[];
  people: ResearchPeopleSummary | null;
};

/** BullMQ health, as the research queue page shows it. */
export type QueueStatus = {
  redis: boolean;
  counts: {
    research?: { waiting: number; active: number; failed: number };
    [key: string]: { waiting: number; active: number; failed: number } | undefined;
  };
};
