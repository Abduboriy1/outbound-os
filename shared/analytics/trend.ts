/**
 * `monthlyTrend`, moved out of `server/lib/analytics/queries.ts` (which loads
 * rows through Prisma and cannot be shared) so the analytics page can build the
 * trend chart in the browser.
 *
 * `/api/analytics` returns the assembled report, not the lead rows the trend is
 * derived from, so the page feeds this the rows from `/api/leads` — which is
 * why the row type is widened to accept the ISO strings a JSON response
 * carries. `AnalyticsLeadRow`, what every server caller passes, still fits.
 */
export type TrendLeadRow = {
  createdAt: string | Date;
  wonAt: string | Date | null;
  estimatedValueMin: number | null;
  estimatedValueMax: number | null;
};

export type TrendBucket = {
  month: string;
  created: number;
  won: number;
  wonRevenue: number;
};

/** Won-deal counts per month, for the revenue trend chart. */
export function monthlyTrend(
  leads: TrendLeadRow[],
  months = 12,
  now = new Date(),
): TrendBucket[] {
  const buckets: TrendBucket[] = [];
  const index = new Map<string, number>();

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = date.toISOString().slice(0, 7);
    index.set(key, buckets.length);
    buckets.push({ month: key, created: 0, won: 0, wonRevenue: 0 });
  }

  for (const lead of leads) {
    const createdKey = new Date(lead.createdAt).toISOString().slice(0, 7);
    const createdBucket = index.get(createdKey);
    if (createdBucket != null) buckets[createdBucket]!.created += 1;

    if (lead.wonAt) {
      const wonKey = new Date(lead.wonAt).toISOString().slice(0, 7);
      const wonBucket = index.get(wonKey);
      if (wonBucket != null) {
        const bucket = buckets[wonBucket]!;
        bucket.won += 1;
        const min = lead.estimatedValueMin;
        const max = lead.estimatedValueMax;
        bucket.wonRevenue +=
          min != null && max != null ? (min + max) / 2 : (min ?? max ?? 0);
      }
    }
  }

  return buckets;
}
