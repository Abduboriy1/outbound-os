/**
 * Wire shapes for the outreach screens.
 *
 * These mirror the read models in `server/lib/outreach/queries.ts`, with every
 * `Date` narrowed to the `string` that survives JSON. Prisma enums are imported
 * as types only, which MIGRATION.md §5.4 allows because the import is erased.
 */

import type {
  MessageDirection,
  ReplyIntent,
} from "~~/server/generated/prisma/client";
import type { ComplianceBlock } from "~~/server/lib/compliance";

/* --------------------------------------------------- approval queue */

/** `GET /api/outreach/drafts` — one entry per card. */
export type ApprovalDraft = {
  id: string;
  leadId: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactTitle: string | null;
  channel: string;
  variant: string;
  subject: string | null;
  body: string;
  reason: string | null;
  score: number | null;
  stage: string;
  regenerationHint: string | null;
  regeneratedFrom: { id: string; body: string } | null;
  createdAt: string;
  blocks: ComplianceBlock[];
  placeholders: string[];
};

/** The compliance pre-flight shown above the queue (plan §37). */
export type ComplianceStatus = {
  provider: string;
  configured: boolean;
  senderName: string;
  senderEmail: string;
  physicalAddress: string;
  unsubscribeText: string;
  dailySendLimit: number;
  sentToday: number;
  suppressed: number;
  /** The footer appended on send, rendered server-side. */
  footerPreview: string | null;
};

/** A row of `GET /api/leads`, which is what the "ready for outreach" table reads. */
export type LeadListRow = {
  id: string;
  stage: string;
  overallScore: number | null;
  company: { id: string; name: string; domain: string | null; industry: string | null };
  contact: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
  } | null;
};

/* ------------------------------------------------------------- inbox */

export type ThreadMessage = {
  id: string;
  direction: MessageDirection;
  fromEmail: string;
  toEmail: string;
  subject: string | null;
  body: string;
  snippet: string | null;
  sentAt: string;
  bounced: boolean;
  intent: ReplyIntent | null;
  sentiment: string | null;
  aiSummary: string | null;
  questions: string[];
  objections: string[];
  recommendedAction: string | null;
};

export type InboxThread = {
  id: string;
  subject: string;
  lastMessageAt: string;
  lead: {
    id: string;
    stage: string;
    overallScore: number | null;
    company: { name: string; industry: string | null };
  } | null;
  contact: {
    firstName: string;
    lastName: string | null;
    email: string | null;
    title: string | null;
  } | null;
  messages: ThreadMessage[];
  _count: { messages: number };
};

export type ThreadDetail = {
  id: string;
  subject: string;
  lastMessageAt: string;
  lead: {
    id: string;
    stage: string;
    overallScore: number | null;
    nextAction: string | null;
    nextActionDueAt: string | null;
    company: { name: string; industry: string | null; website: string | null };
    opportunities: { title: string; problem: string | null }[];
  } | null;
  contact: { firstName: string; lastName: string | null; email: string | null } | null;
  messages: ThreadMessage[];
};

/* --------------------------------------------------------- sequences */

export type SequenceStep = {
  id: string;
  dayOffset: number;
  purpose: string;
  channel: string;
};

export type SequenceEnrollment = {
  id: string;
  status: string;
  currentStep: number;
  pausedReason: string | null;
  nextRunAt: string | null;
  lead: { id: string; stage: string; company: { name: string } };
};

export type SequenceOverview = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  steps: SequenceStep[];
  enrollments: SequenceEnrollment[];
};

/** One row of the sequence builder. */
export type SequenceDraftStep = {
  dayOffset: number;
  purpose: string;
  channel: "EMAIL" | "LINKEDIN";
};
