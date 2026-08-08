/**
 * Port of `src/app/(app)/outreach/actions.ts`.
 *
 * Server actions have no Nuxt equivalent (MIGRATION.md §2.3), so each action
 * becomes a `$fetch` against the API route that already does the same work
 * (§4.2). The signatures keep the source's names and its `ActionState` result
 * shape, but take a plain object instead of `FormData` — Vue forms are
 * `v-model`-bound, so there is no FormData to read.
 *
 * `revalidatePath` has no equivalent either: the caller refreshes its own
 * `useFetch` from the `result` event that `ActionForm` emits.
 */

import { OUTREACH_VARIANTS, REGENERATION_HINTS } from "./constants";
import type { RegenerationHint } from "./constants";
import type { SequenceDraftStep } from "./types";

export type ActionState = { error?: string; message?: string } | undefined;

/**
 * The API answers `{ error }` with the message the server action would have
 * produced — including the `Blocked by compliance: …` prefix, which
 * `/api/outreach/drafts/[id]/approve` adds itself.
 */
function fail(error: unknown): ActionState {
  const body = (error as { data?: { error?: string } } | null)?.data;
  if (body?.error) return { error: body.error };
  return {
    error: error instanceof Error ? error.message : "Something went wrong",
  };
}

/* ------------------------------------------------------------ approvals */

/**
 * The only entry point that results in a message being sent. It is reachable
 * only from a form the user submits, and the endpoint runs the compliance gate
 * and writes the approval record.
 */
export async function approveAndSendAction(input: {
  draftId: string;
  channel: string;
  subject?: string;
  body: string;
}): Promise<ActionState> {
  if (!input.draftId) return { error: "Missing draft" };
  if (!input.body) return { error: "The message body is empty" };

  try {
    if (input.channel !== "EMAIL") {
      // Port of `approveForManualSend`: a channel the app cannot send on
      // gets an approval record and a task, not a send attempt.
      await $fetch(`/api/outreach/drafts/${input.draftId}/approve-manual`, {
        method: "POST",
        body: { approve: true },
      });
      return { message: "Approved. A task was created to send it by hand." };
    }

    const result = await $fetch<{
      data: { providerMessageId: string | null };
    }>(`/api/outreach/drafts/${input.draftId}/approve`, {
      method: "POST",
      body: {
        approve: true,
        subject: input.subject ?? undefined,
        bodyText: input.body,
      },
    });
    return { message: `Sent (${result.data.providerMessageId}).` };
  } catch (error) {
    return fail(error);
  }
}

export async function rejectDraftAction(input: {
  draftId: string;
  reason: string;
}): Promise<ActionState> {
  const reason = input.reason.trim();
  if (!input.draftId) return { error: "Missing draft" };
  if (!reason) return { error: "Give a reason so the agent can learn from it" };

  try {
    await $fetch(`/api/outreach/drafts/${input.draftId}/reject`, {
      method: "POST",
      body: { reason },
    });
    return { message: "Draft rejected." };
  } catch (error) {
    return fail(error);
  }
}

/**
 * `POST /api/outreach/drafts/:id/regenerate` does the whole thing in one call:
 * it passes `regenerationHint` through to the agent (so "Shorter" actually
 * tells the model to be shorter) and rejects the superseded draft itself,
 * keeping it for the audit trail. `leadId`, `variant` and `reason` are read off
 * the stored draft server-side; they stay in the signature because the card
 * passes them and the source action took them.
 */
export async function regenerateDraftAction(input: {
  draftId: string;
  hint: string;
  leadId: string;
  variant: string;
  reason: string | null;
}): Promise<ActionState> {
  if (!input.draftId) return { error: "Missing draft" };
  if (!(REGENERATION_HINTS as readonly string[]).includes(input.hint)) {
    return { error: "Unknown regeneration option" };
  }

  try {
    await $fetch(`/api/outreach/drafts/${input.draftId}/regenerate`, {
      method: "POST",
      body: { hint: input.hint as RegenerationHint },
    });
    return { message: "Regenerated." };
  } catch (error) {
    return fail(error);
  }
}

export async function generateDraftAction(input: {
  leadId: string;
  variant: string;
  reason?: string | null;
}): Promise<ActionState> {
  if (!input.leadId) return { error: "Missing lead" };
  if (!(OUTREACH_VARIANTS as readonly string[]).includes(input.variant)) {
    return { error: "Invalid option" };
  }

  try {
    await $fetch("/api/outreach/drafts", {
      method: "POST",
      body: {
        leadId: input.leadId,
        variant: input.variant,
        reason: input.reason || undefined,
      },
    });
    return { message: "Draft added to the approval queue." };
  } catch (error) {
    return fail(error);
  }
}

/* ---------------------------------------------------------------- inbox */

export async function ingestRepliesAction(): Promise<ActionState> {
  try {
    const result = await $fetch<{
      data: {
        fetched: number;
        ingested: number;
        bounces: number;
        optOuts: number;
        draftsCreated: number;
      };
    }>("/api/email/ingest", { method: "POST", body: {} });
    const r = result.data;
    return {
      message: `Fetched ${r.fetched}, ingested ${r.ingested}, ${r.bounces} bounce(s), ${r.optOuts} opt-out(s), ${r.draftsCreated} draft(s) awaiting approval.`,
    };
  } catch (error) {
    return fail(error);
  }
}

/** Drafts a reply for a thread. It lands in the approval queue like any other. */
export async function draftReplyAction(input: {
  leadId: string;
}): Promise<ActionState> {
  if (!input.leadId) return { error: "Missing lead" };

  try {
    await $fetch("/api/outreach/drafts", {
      method: "POST",
      body: {
        leadId: input.leadId,
        variant: "FOLLOW_UP",
        reason: "Manual reply drafted from the inbox",
      },
    });
    return { message: "Reply drafted. Approve it in the queue to send." };
  } catch (error) {
    return fail(error);
  }
}

/* ------------------------------------------------------------ sequences */

export async function createSequenceAction(input: {
  name: string;
  description?: string;
  steps: SequenceDraftStep[];
}): Promise<ActionState> {
  if (!input.name.trim()) return { error: "Name the sequence" };
  if (input.steps.length === 0) {
    return { error: "A sequence needs at least one step" };
  }

  try {
    // Port of `createSequenceAction`.
    const result = await $fetch<{ data: { name: string } }>(
      "/api/outreach/sequences",
      {
        method: "POST",
        body: {
          name: input.name,
          description: input.description || undefined,
          steps: input.steps,
        },
      },
    );
    return { message: `Created "${result.data.name}".` };
  } catch (error) {
    return fail(error);
  }
}

export async function enrolLeadAction(input: {
  sequenceId: string;
  leadId: string;
}): Promise<ActionState> {
  if (!input.sequenceId || !input.leadId) {
    return { error: "Pick a sequence and a lead" };
  }

  try {
    // Port of `enrolLead`.
    await $fetch("/api/outreach/sequences/enrol", {
      method: "POST",
      body: { sequenceId: input.sequenceId, leadId: input.leadId },
    });
    return {
      message: "Enrolled. Every step still needs approval before it sends.",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function pauseEnrollmentAction(input: {
  enrollmentId: string;
}): Promise<ActionState> {
  if (!input.enrollmentId) return { error: "Missing enrolment" };

  try {
    // Port of `pauseEnrollment`.
    await $fetch(`/api/outreach/enrollments/${input.enrollmentId}/pause`, {
      method: "POST",
      body: { reason: "MANUAL" },
    });
    return { message: "Paused." };
  } catch (error) {
    return fail(error);
  }
}

export async function runSequencesAction(): Promise<ActionState> {
  try {
    const result = await $fetch<{
      data: { generated: number; paused: unknown[]; completed: number };
    }>("/api/outreach/sequences/run", { method: "POST" });
    const r = result.data;
    return {
      message: `${r.generated} draft(s) queued for approval, ${r.paused.length} enrolment(s) paused, ${r.completed} completed.`,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function sweepFollowUpsAction(): Promise<ActionState> {
  try {
    const result = await $fetch<{
      data: { created: number; flagged: unknown[] };
    }>("/api/outreach/followups", { method: "POST" });
    const r = result.data;
    return {
      message: `${r.created} follow-up task(s) created, ${r.flagged.length} lead(s) flagged.`,
    };
  } catch (error) {
    return fail(error);
  }
}
