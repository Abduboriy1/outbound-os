import type { LeadSourceType } from "~~/server/generated/prisma/client";
import { rate, reachedStep } from "./funnel";
import type { AnalyticsLeadRow } from "./types";

export type AcquisitionRow = Pick<
  AnalyticsLeadRow,
  "stage" | "reachedStages" | "researched" | "sourceType"
>;

export type SourceBreakdown = {
  source: LeadSourceType;
  leads: number;
  researched: number;
  qualified: number;
  qualifiedRate: number;
};

export type AcquisitionSummary = {
  discovered: number;
  researched: number;
  researchedRate: number;
  qualified: number;
  /** Share of discovered leads that survived qualification (plan §30). */
  qualifiedRate: number;
  bySource: SourceBreakdown[];
};

export function computeAcquisition(rows: AcquisitionRow[]): AcquisitionSummary {
  const researched = rows.filter((r) => r.researched).length;
  const qualified = rows.filter((r) => reachedStep(r, "QUALIFIED")).length;

  const groups = new Map<LeadSourceType, AcquisitionRow[]>();
  for (const row of rows) {
    const bucket = groups.get(row.sourceType);
    if (bucket) bucket.push(row);
    else groups.set(row.sourceType, [row]);
  }

  const bySource = [...groups.entries()]
    .map(([source, group]) => {
      const groupQualified = group.filter((r) => reachedStep(r, "QUALIFIED")).length;
      return {
        source,
        leads: group.length,
        researched: group.filter((r) => r.researched).length,
        qualified: groupQualified,
        qualifiedRate: rate(groupQualified, group.length),
      };
    })
    .sort((a, b) => b.leads - a.leads);

  return {
    discovered: rows.length,
    researched,
    researchedRate: rate(researched, rows.length),
    qualified,
    qualifiedRate: rate(qualified, rows.length),
    bySource,
  };
}

export { SOURCE_LABELS } from "~~/shared/analytics/sources";
