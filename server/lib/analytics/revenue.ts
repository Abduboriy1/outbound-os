import type { LeadStage } from "~~/server/generated/prisma/client";
import { PIPELINE_STAGES, STAGE_WIN_PROBABILITY } from "~~/shared/stages";
import type { AnalyticsLeadRow } from "./types";
import { leadValue } from "~~/shared/analytics/lead-value";

export type RevenueRow = Pick<
  AnalyticsLeadRow,
  | "stage"
  | "estimatedValueMin"
  | "estimatedValueMax"
  | "createdAt"
  | "wonAt"
  | "lostAt"
>;

/** Moved to `shared/analytics/lead-value.ts` (MIGRATION.md §1). */
export { leadValue };

const CLOSED_STAGES: LeadStage[] = ["WON", "CUSTOMER"];

/** Open pipeline: still moving forward, not yet won and not off-pipeline. */
export function isOpenPipeline(row: Pick<RevenueRow, "stage" | "lostAt" | "wonAt">) {
  if (row.wonAt || row.lostAt) return false;
  if (CLOSED_STAGES.includes(row.stage)) return false;
  return PIPELINE_STAGES.includes(row.stage);
}

export type RevenueSummary = {
  openCount: number;
  /** Sum of estimated value across open deals. */
  pipelineValue: number;
  /** Pipeline value discounted by the win probability of each stage. */
  weightedPipeline: number;
  wonCount: number;
  wonRevenue: number;
  lostCount: number;
  lostRevenue: number;
  /** Mean won-deal value. Null when nothing has closed yet. */
  averageDealSize: number | null;
  /** Mean days from lead creation to win. Null when nothing has closed. */
  averageSalesCycleDays: number | null;
  /** Won as a share of everything that closed either way. */
  winRate: number;
};

export function computeRevenue(rows: RevenueRow[]): RevenueSummary {
  let openCount = 0;
  let pipelineValue = 0;
  let weightedPipeline = 0;
  let wonCount = 0;
  let wonRevenue = 0;
  let lostCount = 0;
  let lostRevenue = 0;
  let cycleDaysTotal = 0;
  let cycleSamples = 0;

  for (const row of rows) {
    const value = leadValue(row);

    if (isOpenPipeline(row)) {
      openCount += 1;
      pipelineValue += value;
      weightedPipeline += value * (STAGE_WIN_PROBABILITY[row.stage] ?? 0);
    }

    if (row.wonAt) {
      wonCount += 1;
      wonRevenue += value;
      const days = (row.wonAt.getTime() - row.createdAt.getTime()) / 86_400_000;
      if (days >= 0) {
        cycleDaysTotal += days;
        cycleSamples += 1;
      }
    } else if (row.lostAt) {
      lostCount += 1;
      lostRevenue += value;
    }
  }

  const closed = wonCount + lostCount;
  return {
    openCount,
    pipelineValue: round(pipelineValue),
    weightedPipeline: round(weightedPipeline),
    wonCount,
    wonRevenue: round(wonRevenue),
    lostCount,
    lostRevenue: round(lostRevenue),
    averageDealSize: wonCount ? round(wonRevenue / wonCount) : null,
    averageSalesCycleDays: cycleSamples
      ? Math.round((cycleDaysTotal / cycleSamples) * 10) / 10
      : null,
    winRate: closed ? Math.round((wonCount / closed) * 1000) / 10 : 0,
  };
}

function round(value: number) {
  return Math.round(value);
}
