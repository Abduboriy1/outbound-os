import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Ported verbatim from the Next app's `src/lib/utils.ts`.
 *
 * It lives under `app/utils/` so Nuxt auto-imports every export: `cn`,
 * `formatCurrency`, `formatRange`, `percent` and `relativeTime` are available
 * in any component or page without an import statement. The server copy at
 * `server/lib/utils.ts` is the same file and is what server code should use.
 */

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatRange(min?: number | null, max?: number | null) {
  if (min == null && max == null) return "—";
  if (min != null && max != null)
    return `${formatCurrency(min)}–${formatCurrency(max)}`;
  return formatCurrency(min ?? max);
}

export function percent(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function relativeTime(date: Date | string | null | undefined) {
  if (!date) return "never";
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const abs = Math.abs(diffMs);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 24 * 3600e3],
    ["month", 30 * 24 * 3600e3],
    ["day", 24 * 3600e3],
    ["hour", 3600e3],
    ["minute", 60e3],
  ];
  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (abs >= ms) return fmt.format(-Math.round(diffMs / ms), unit);
  }
  return "just now";
}
