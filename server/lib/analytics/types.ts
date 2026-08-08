import type {
  LeadSourceType,
  LeadStage,
  ReplyIntent,
} from "~~/server/generated/prisma/client";

/**
 * Row shapes the analytics maths operates on (plan §30). They are deliberately
 * plain: every calculation is a pure function over these, so the numbers can be
 * tested without a database and reused by the dashboard, the API and the AI
 * weekly review.
 */
export type AnalyticsLeadRow = {
  id: string;
  stage: LeadStage;
  /** Every stage this lead has ever entered, from LeadStageHistory. */
  reachedStages: LeadStage[];
  createdAt: Date;
  wonAt: Date | null;
  lostAt: Date | null;
  lostReason: string | null;
  estimatedValueMin: number | null;
  estimatedValueMax: number | null;
  sourceType: LeadSourceType;
  /** True once a research report for this lead has completed. */
  researched: boolean;
  icpName: string | null;
  industry: string | null;
  employeeCount: number | null;
  /** Problem headline of each opportunity generated for this lead. */
  problems: string[];
};

export type SentMessageRow = {
  sentAt: Date | null;
  bounced: boolean;
};

export type ReplyRow = {
  intent: ReplyIntent | null;
  receivedAt: Date;
};

export type DateWindow = { start: Date; end: Date };

export function inWindow(date: Date | null, window?: DateWindow): boolean {
  if (!date) return false;
  if (!window) return true;
  return date >= window.start && date < window.end;
}
