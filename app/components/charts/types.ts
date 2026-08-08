/**
 * Chart datum shapes, carried over verbatim from
 * `src/components/charts/index.tsx`. They were exported from the component
 * module in React; here they live beside the SFCs so both the charts and the
 * pages that build their data can import them.
 */
export type FunnelDatum = {
  label: string;
  count: number;
  conversionFromPrevious: number | null;
};

export type TrendDatum = {
  month: string;
  created: number;
  won: number;
  wonRevenue: number;
};
