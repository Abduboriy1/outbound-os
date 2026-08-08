/**
 * Status tone shared by the design-system components and the server-side
 * helpers that decide which tone a row should be rendered with.
 *
 * It lives in `shared/` because `server/lib/stages.ts` and
 * `server/lib/outreach/followups.ts` both label their output with a tone, and
 * the Vue components consume the same union. In the Next app this type was
 * exported from `src/components/ui/index.tsx`; server code must not import a
 * Vue SFC, so the type was lifted out.
 */
export type Tone = "neutral" | "accent" | "positive" | "warning" | "danger";
