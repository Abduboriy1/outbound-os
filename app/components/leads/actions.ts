/**
 * Port of the three server-action modules in the source:
 * `(app)/leads/actions.ts`, `(app)/companies/actions.ts` and
 * `(app)/people/actions.ts`.
 *
 * Server actions have no Nuxt equivalent (MIGRATION.md §2.3), so each one
 * becomes an HTTP call to the endpoint in §4.2 that runs the very same
 * mutation. Three consequences worth knowing:
 *
 * - `revalidatePath(...)` becomes `refreshNuxtData()`, called by the page after
 *   the action resolves, so the lead/company/people views it invalidated are
 *   re-fetched.
 * - `redirect(...)` becomes `navigateTo(...)`.
 * - Errors surface as a `FetchError` carrying the endpoint's `{ error }` body,
 *   which `toFormError` turns back into the same message the form used to show.
 */
import { toFormError } from "./form-state";
import type { FormState, FormValues } from "./types";

/** Port of `formToObject(formData, prefix)` for an already-flat value object. */
export function pickPrefixed(values: FormValues, prefix: string): FormValues {
  const out: FormValues = {};
  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith(prefix)) continue;
    out[key.slice(prefix.length)] = value;
  }
  return out;
}

/** Port of `formToObject(formData)` with the prefixed keys stripped out. */
function unprefixed(values: FormValues): FormValues {
  const out: FormValues = {};
  for (const [key, value] of Object.entries(values)) {
    if (key.includes(".")) continue;
    out[key] = value;
  }
  return out;
}

type Created = { data: { id: string } };

/* ------------------------------------------------------------------- leads */

/** Port of `saveLeadAction`. */
export async function saveLeadAction(values: FormValues): Promise<FormState> {
  const id = (values.id ?? "").trim();
  const { id: _id, ...input } = values;

  let leadId: string;
  try {
    const res = id
      ? await $fetch<Created>(`/api/leads/${id}`, { method: "PATCH", body: input })
      : await $fetch<Created>("/api/leads", { method: "POST", body: input });
    leadId = res.data.id;
  } catch (error) {
    return toFormError(error);
  }

  await refreshNuxtData();
  await navigateTo(`/leads/${leadId}`);
  return { ok: true };
}

/**
 * Port of `quickLeadAction` — company, first contact and lead in one
 * submission (plan §13 entry point).
 *
 * Deviation: the source did all three writes inside one server action. There is
 * no single endpoint for that, so this is three sequential calls to
 * `/api/companies`, `/api/contacts` and `/api/leads`. The failure modes differ:
 * if the lead call fails the company is already created, where the server
 * action would have surfaced the same error with the company still created too
 * (it was not transactional either), but a failed contact call now aborts
 * before the lead is made.
 */
export async function quickLeadAction(values: FormValues): Promise<FormState> {
  const companyInput = pickPrefixed(values, "company.");
  const contactRaw = pickPrefixed(values, "contact.");
  const leadInput = unprefixed(values);

  let leadId: string;
  try {
    const company = await $fetch<Created>("/api/companies", {
      method: "POST",
      body: companyInput,
    });

    let contactId: string | null = null;
    if (contactRaw.firstName?.trim()) {
      const contact = await $fetch<Created>("/api/contacts", {
        method: "POST",
        body: { ...contactRaw, companyId: company.data.id },
      });
      contactId = contact.data.id;
    }

    const lead = await $fetch<Created>("/api/leads", {
      method: "POST",
      body: { ...leadInput, companyId: company.data.id, contactId },
    });
    leadId = lead.data.id;
  } catch (error) {
    return toFormError(error);
  }

  await refreshNuxtData();
  await navigateTo(`/leads/${leadId}`);
  return { ok: true };
}

/** Port of `changeStageAction`. */
export async function changeStageAction(values: FormValues): Promise<FormState> {
  const leadId = values.leadId ?? "";
  try {
    await $fetch(`/api/leads/${leadId}/stage`, {
      method: "POST",
      body: { stage: values.stage, reason: values.reason, actorType: "HUMAN" },
    });
  } catch (error) {
    return toFormError(error);
  }

  await refreshNuxtData();
  return { ok: true };
}

/**
 * Port of `setNextActionAction` — `POST /api/leads/:id/next-action`, which
 * parses the source's own `nextActionSchema` and calls the same
 * `setNextAction()` mutation, so the `NEXT_ACTION_SET` /
 * `NEXT_ACTION_CLEARED` activity row and the `lastActivityAt` bump are written
 * as they were.
 *
 * This used to PATCH `/api/leads/:id` with the lead's whole current record
 * because no endpoint covered the mutation. That persisted the field but wrote
 * no activity row, and it is why the signature still takes a `lead` object —
 * only `id` is read from it now.
 */
export async function setNextActionAction(
  lead: { id: string },
  values: FormValues,
): Promise<FormState> {
  try {
    await $fetch(`/api/leads/${lead.id}/next-action`, {
      method: "POST",
      body: {
        nextAction: values.nextAction,
        nextActionDueAt: values.nextAction ? values.nextActionDueAt : null,
      },
    });
  } catch (error) {
    return toFormError(error);
  }

  await refreshNuxtData();
  return { ok: true };
}

/** Port of `addNoteAction` — `POST /api/leads/:id/notes` → `addLeadNote()`. */
export async function addNoteAction(values: FormValues): Promise<FormState> {
  const leadId = values.leadId ?? "";
  const note = (values.note ?? "").trim();
  if (!note) return { error: "A note cannot be empty" };

  try {
    await $fetch(`/api/leads/${leadId}/notes`, { method: "POST", body: { note } });
  } catch (error) {
    return toFormError(error);
  }

  await refreshNuxtData();
  return { ok: true };
}

/** Port of `logContactAction` — `POST /api/leads/:id/contact-log`. */
export async function logContactAction(values: FormValues): Promise<FormState> {
  const leadId = values.leadId ?? "";
  const summary = (values.summary ?? "").trim();
  if (!summary) return { error: "Describe what happened" };

  try {
    await $fetch(`/api/leads/${leadId}/contact-log`, {
      method: "POST",
      body: { summary },
    });
  } catch (error) {
    return toFormError(error);
  }

  await refreshNuxtData();
  return { ok: true };
}

/** Port of `addLeadTaskAction`. */
export async function addLeadTaskAction(values: FormValues): Promise<FormState> {
  try {
    await $fetch("/api/tasks", { method: "POST", body: values });
  } catch (error) {
    return toFormError(error);
  }

  await refreshNuxtData();
  return { ok: true };
}

/** Port of `setLeadTaskStatusAction`. */
export async function setLeadTaskStatusAction(values: FormValues): Promise<void> {
  await $fetch(`/api/tasks/${values.id}`, {
    method: "PATCH",
    body: { status: values.status },
  });
  await refreshNuxtData();
}

/** Port of `deleteLeadAction`. */
export async function deleteLeadAction(values: FormValues): Promise<void> {
  await $fetch(`/api/leads/${values.id}`, { method: "DELETE" });
  await refreshNuxtData();
  await navigateTo("/leads");
}

/* --------------------------------------------------------------- companies */

/** Port of `saveCompanyAction`. */
export async function saveCompanyAction(values: FormValues): Promise<FormState> {
  const id = (values.id ?? "").trim();
  const { id: _id, ...input } = values;

  let companyId: string;
  try {
    const res = id
      ? await $fetch<Created>(`/api/companies/${id}`, { method: "PATCH", body: input })
      : await $fetch<Created>("/api/companies", { method: "POST", body: input });
    companyId = res.data.id;
  } catch (error) {
    return toFormError(error);
  }

  await refreshNuxtData();
  await navigateTo(`/companies/${companyId}`);
  return { ok: true };
}

/** Port of `deleteCompanyAction`. */
export async function deleteCompanyAction(values: FormValues): Promise<void> {
  await $fetch(`/api/companies/${values.id}`, { method: "DELETE" });
  await refreshNuxtData();
  await navigateTo("/companies");
}

/* ---------------------------------------------------------------- contacts */

/** Port of `saveContactAction`. */
export async function saveContactAction(values: FormValues): Promise<FormState> {
  const id = (values.id ?? "").trim();
  const { id: _id, ...input } = values;

  let contactId: string;
  try {
    const res = id
      ? await $fetch<Created>(`/api/contacts/${id}`, { method: "PATCH", body: input })
      : await $fetch<Created>("/api/contacts", { method: "POST", body: input });
    contactId = res.data.id;
  } catch (error) {
    return toFormError(error);
  }

  await refreshNuxtData();
  await navigateTo(`/people/${contactId}`);
  return { ok: true };
}

/** Port of `deleteContactAction`. */
export async function deleteContactAction(values: FormValues): Promise<void> {
  await $fetch(`/api/contacts/${values.id}`, { method: "DELETE" });
  await refreshNuxtData();
  await navigateTo("/people");
}
