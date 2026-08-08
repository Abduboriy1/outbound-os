/** Port of the non-component exports of `src/components/dashboard/metrics.tsx`. */
import { formatCurrency } from "~/utils/format";

export type MetricSpec = {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "neutral" | "positive" | "warning" | "danger";
};

export function formatPercent(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value}%`;
}

export function formatMoney(value: number | null | undefined) {
  return value == null ? "—" : formatCurrency(value);
}
