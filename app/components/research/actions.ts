/**
 * Port of `src/app/(app)/research/icps/actions.ts` and
 * `src/app/(app)/research/queue/actions.ts`.
 *
 * Server actions have no Nuxt equivalent (MIGRATION.md §2.3). Each one becomes
 * a `$fetch` against the endpoint that already runs the same logic, so the
 * validation, the transaction and the audit entry all still happen exactly
 * once, server-side.
 *
 * `icpSchema` also validated in the action before hitting the database; here
 * the endpoint is the only validator, and its 422 `details` carry the same
 * message the action used to return.
 */

import type { IcpEditorValues } from "./types";

export type IcpFormState = { error?: string };

/** The API answers 422 with `{ error, details }`; the first issue is what the
 *  server action surfaced, so that is what is shown. */
function message(error: unknown, fallback: string): string {
  const body = (error as { data?: { error?: string; details?: unknown } } | null)
    ?.data;
  const details = body?.details;
  if (Array.isArray(details)) {
    const first = details[0] as { message?: string } | undefined;
    if (first?.message) return first.message;
  }
  return body?.error ?? fallback;
}

/** The `icpSchema` body. Lists go over as arrays; the schema accepts both. */
function toBody(values: IcpEditorValues) {
  return {
    name: values.name,
    description: values.description,
    industries: values.industries,
    geographies: values.geographies,
    problems: values.problems,
    targetRoles: values.targetRoles,
    minEmployees: values.minEmployees,
    maxEmployees: values.maxEmployees,
    minDealSize: values.minDealSize,
    maxDealSize: values.maxDealSize,
    isDefault: values.isDefault,
    weights: values.weights,
    rules: values.rules.filter(
      (rule) => rule.field.trim() !== "" && rule.value.trim() !== "",
    ),
  };
}

export async function createIcpAction(
  values: IcpEditorValues,
): Promise<IcpFormState & { id?: string }> {
  try {
    const result = await $fetch<{ data: { id: string } }>("/api/icps", {
      method: "POST",
      body: toBody(values),
    });
    return { id: result.data.id };
  } catch (error) {
    return { error: message(error, "Invalid ICP") };
  }
}

export async function updateIcpAction(
  id: string,
  values: IcpEditorValues,
): Promise<IcpFormState> {
  if (!id) return { error: "ICP not found" };
  try {
    await $fetch(`/api/icps/${id}`, { method: "PATCH", body: toBody(values) });
    return {};
  } catch (error) {
    return { error: message(error, "Invalid ICP") };
  }
}

export async function deleteIcpAction(id: string): Promise<IcpFormState> {
  if (!id) return {};
  try {
    await $fetch(`/api/icps/${id}`, { method: "DELETE" });
    return {};
  } catch (error) {
    return { error: message(error, "Could not delete this ICP") };
  }
}

/**
 * `PATCH /api/icps/:id` replaces the profile wholesale — including its rules —
 * so promoting one to default means resending everything it already has. The
 * endpoint demotes the incumbent inside the same transaction, which is what the
 * server action did by hand.
 */
export async function makeDefaultIcpAction(
  icp: IcpEditorValues,
): Promise<IcpFormState> {
  if (!icp.id) return {};
  return updateIcpAction(icp.id, { ...icp, isDefault: true });
}

/* ------------------------------------------------------------- queue */

/** Re-runs an existing report in place (plan §32: research is re-runnable). */
export async function rerunResearchAction(
  reportId: string,
): Promise<IcpFormState> {
  if (!reportId) return {};
  try {
    await $fetch(`/api/research/${reportId}`, { method: "POST" });
    return {};
  } catch (error) {
    return { error: message(error, "Could not re-run this report") };
  }
}

/**
 * Queues a score recomputation without re-fetching any pages.
 * `POST /api/leads/:id/rescore` enqueues the same `scoring` job the source
 * enqueued directly.
 */
export async function rescoreLeadAction(leadId: string): Promise<IcpFormState> {
  if (!leadId) return {};
  try {
    await $fetch(`/api/leads/${leadId}/rescore`, { method: "POST" });
    return {};
  } catch (error) {
    return { error: message(error, "Could not queue a rescore") };
  }
}
