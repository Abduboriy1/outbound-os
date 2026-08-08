import { rate, reachedStep } from "./funnel";
import { leadValue } from "./revenue";
import type { AnalyticsLeadRow } from "./types";

/**
 * Plan §30 "Performance By". Every dimension answers the same question — which
 * slice of the market actually converts — so they share one summary shape and
 * differ only in how a row is keyed.
 */
export type PerformanceSummary = {
  leads: number;
  qualified: number;
  contacted: number;
  replied: number;
  discovery: number;
  proposals: number;
  won: number;
  wonRevenue: number;
  replyRate: number;
  winRate: number;
};

export type PerformanceBucket = PerformanceSummary & { key: string };

export function summarisePerformance(rows: AnalyticsLeadRow[]): PerformanceSummary {
  const contacted = rows.filter((r) => reachedStep(r, "CONTACTED")).length;
  const replied = rows.filter((r) => reachedStep(r, "RESPONDED")).length;
  const won = rows.filter((r) => r.wonAt !== null).length;

  return {
    leads: rows.length,
    qualified: rows.filter((r) => reachedStep(r, "QUALIFIED")).length,
    contacted,
    replied,
    discovery: rows.filter((r) => reachedStep(r, "DISCOVERY")).length,
    proposals: rows.filter((r) => reachedStep(r, "PROPOSAL_SENT")).length,
    won,
    wonRevenue: Math.round(
      rows.filter((r) => r.wonAt !== null).reduce((sum, r) => sum + leadValue(r), 0),
    ),
    replyRate: rate(replied, contacted),
    winRate: rate(won, rows.length),
  };
}

/**
 * Groups rows by a caller-supplied key. `keyOf` may return several keys so a
 * lead with three identified problems contributes to all three buckets; rows
 * with no key at all land in `fallback` rather than disappearing.
 */
export function breakdownBy(
  rows: AnalyticsLeadRow[],
  keyOf: (row: AnalyticsLeadRow) => string | string[] | null | undefined,
  fallback = "Unknown",
): PerformanceBucket[] {
  const groups = new Map<string, AnalyticsLeadRow[]>();

  for (const row of rows) {
    const raw = keyOf(row);
    const keys = (Array.isArray(raw) ? raw : [raw])
      .map((k) => (k == null || k === "" ? fallback : k))
      .filter((k, i, all) => all.indexOf(k) === i);
    for (const key of keys.length ? keys : [fallback]) {
      const bucket = groups.get(key);
      if (bucket) bucket.push(row);
      else groups.set(key, [row]);
    }
  }

  return [...groups.entries()]
    .map(([key, group]) => ({ key, ...summarisePerformance(group) }))
    .sort((a, b) => b.wonRevenue - a.wonRevenue || b.leads - a.leads);
}

/** Company-size buckets used for the size dimension. */
export function companySizeBand(employeeCount: number | null): string {
  if (employeeCount == null) return "Unknown";
  if (employeeCount < 10) return "1-9";
  if (employeeCount < 50) return "10-49";
  if (employeeCount < 200) return "50-199";
  if (employeeCount < 500) return "200-499";
  if (employeeCount < 1000) return "500-999";
  return "1000+";
}

export const SIZE_BAND_ORDER = [
  "1-9",
  "10-49",
  "50-199",
  "200-499",
  "500-999",
  "1000+",
  "Unknown",
];
