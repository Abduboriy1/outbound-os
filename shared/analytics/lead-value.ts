/**
 * `leadValue`, moved out of `server/lib/analytics/revenue.ts` so a page can
 * read a deal's value the same way the reports do (MIGRATION.md §1).
 * `revenue.ts` re-exports it.
 */

/**
 * A single number for a deal whose value is stored as a range. The midpoint is
 * the honest reading of "somewhere between these two"; when only one bound is
 * known it is used as-is.
 */
export function leadValue(row: {
  estimatedValueMin: number | null;
  estimatedValueMax: number | null;
}): number {
  const { estimatedValueMin: min, estimatedValueMax: max } = row;
  if (min != null && max != null) return (min + max) / 2;
  return min ?? max ?? 0;
}
