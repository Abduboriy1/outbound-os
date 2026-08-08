/**
 * The non-component exports of `src/components/leads/display.tsx`.
 * The components in that file are one SFC each: `StageBadge.vue`,
 * `ScoreBadge.vue`, `ActivityList.vue`, `LeadCardSummary.vue`.
 */
import type { Tone } from "~~/shared/tone";
import type { DateLike } from "./types";

/** Short absolute date. The UI pairs this with relativeTime where useful. */
export function formatDate(date: DateLike | null | undefined) {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** `yyyy-mm-dd` for prefilling a date input. */
export function toDateInputValue(date: DateLike | null | undefined) {
  if (!date) return "";
  const iso = new Date(date).toISOString();
  return iso.slice(0, 10);
}

/**
 * JSON has no date type, so every timestamp that came through an endpoint is a
 * string at runtime even where Prisma's types say `Date`. Anything that does
 * arithmetic on a timestamp goes through here first.
 */
export function toDate(date: DateLike | null | undefined): Date | null {
  if (!date) return null;
  return typeof date === "string" ? new Date(date) : date;
}

export function scoreTone(score: number): Tone {
  if (score >= 75) return "positive";
  if (score >= 50) return "accent";
  if (score >= 25) return "warning";
  return "neutral";
}
