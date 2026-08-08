import type { LeadStage } from "~~/server/generated/prisma/client";
import { PIPELINE_STAGES } from "~~/shared/stages";
import type { AnalyticsLeadRow } from "./types";

/**
 * The funnel from plan §30. Each step is the first pipeline stage that proves
 * the step happened; a lead counts for a step if it ever reached that stage or
 * anything beyond it, so a deal that is now LOST still shows in every step it
 * passed through.
 */
export const FUNNEL_STEPS = [
  { key: "LEAD", label: "Lead", stage: null },
  { key: "QUALIFIED", label: "Qualified", stage: "QUALIFIED" },
  { key: "CONTACTED", label: "Contacted", stage: "CONTACTED" },
  { key: "REPLY", label: "Reply", stage: "RESPONDED" },
  { key: "DISCOVERY", label: "Discovery", stage: "DISCOVERY" },
  { key: "PROPOSAL", label: "Proposal", stage: "PROPOSAL_SENT" },
  { key: "WON", label: "Won", stage: "WON" },
] as const satisfies readonly {
  key: string;
  label: string;
  stage: LeadStage | null;
}[];

export type FunnelStepKey = (typeof FUNNEL_STEPS)[number]["key"];

const RANK = new Map<LeadStage, number>(
  PIPELINE_STAGES.map((stage, index) => [stage, index]),
);

/** Position on the forward pipeline; -1 for off-pipeline states such as LOST. */
export function stageRank(stage: LeadStage): number {
  return RANK.get(stage) ?? -1;
}

/**
 * Furthest point a lead ever reached. Current stage alone is not enough — a
 * lead sitting in LOST or FOLLOW_UP_LATER has no rank of its own, but its
 * history remembers how far it got.
 */
export function peakRank(row: Pick<AnalyticsLeadRow, "stage" | "reachedStages">): number {
  let peak = stageRank(row.stage);
  for (const stage of row.reachedStages) {
    const rank = stageRank(stage);
    if (rank > peak) peak = rank;
  }
  return peak;
}

export function reachedStep(
  row: Pick<AnalyticsLeadRow, "stage" | "reachedStages">,
  stage: LeadStage | null,
): boolean {
  if (stage === null) return true;
  return peakRank(row) >= stageRank(stage);
}

export type FunnelStep = {
  key: FunnelStepKey;
  label: string;
  count: number;
  /** Conversion from the previous step, as a percentage. Null for the first. */
  conversionFromPrevious: number | null;
  /** Conversion from the top of the funnel, as a percentage. */
  conversionFromLead: number;
};

export function computeFunnel(
  rows: Pick<AnalyticsLeadRow, "stage" | "reachedStages">[],
): FunnelStep[] {
  const counts = FUNNEL_STEPS.map(
    (step) => rows.filter((row) => reachedStep(row, step.stage)).length,
  );
  const top = counts[0];

  return FUNNEL_STEPS.map((step, index) => ({
    key: step.key,
    label: step.label,
    count: counts[index],
    conversionFromPrevious:
      index === 0 ? null : rate(counts[index], counts[index - 1]),
    conversionFromLead: rate(counts[index], top),
  }));
}

/** Percentage with one decimal place; a zero denominator yields 0, not NaN. */
export function rate(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** The single weakest hand-off, which is what the weekly review should flag. */
export function weakestTransition(steps: FunnelStep[]): FunnelStep | null {
  const withPrevious = steps.filter(
    (step): step is FunnelStep & { conversionFromPrevious: number } =>
      step.conversionFromPrevious !== null,
  );
  if (withPrevious.length === 0) return null;
  return withPrevious.reduce((worst, step) =>
    step.conversionFromPrevious < worst.conversionFromPrevious ? step : worst,
  );
}
