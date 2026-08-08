/**
 * Port of `src/lib/leads/form-state.ts`.
 *
 * The types moved to `./types`; what remains is `toFormError`, rewritten for
 * the transport. In Next the schemas ran inside the server action and threw a
 * `ZodError` the form could read directly. Here validation happens in the
 * endpoint, which answers `{ error, details }` (MIGRATION.md §4.3) and makes
 * `$fetch` throw a `FetchError` carrying that body (§5.3) — so the message the
 * form renders is still the server's own, byte for byte.
 */
import type { FormState } from "./types";

type ApiError = {
  data?: { error?: string; details?: { message?: string }[] | unknown };
  statusMessage?: string;
  message?: string;
};

export function toFormError(error: unknown): FormState {
  if (error && typeof error === "object") {
    const err = error as ApiError;
    const details = err.data?.details;
    if (err.data?.error === "Validation failed" && Array.isArray(details)) {
      const first = details[0] as { message?: string } | undefined;
      if (first?.message) return { error: first.message };
    }
    if (err.data?.error) return { error: err.data.error };
    if ("issues" in error) {
      const issues = (error as { issues: { message: string }[] }).issues;
      return { error: issues[0]?.message ?? "Validation failed" };
    }
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "Something went wrong" };
}
