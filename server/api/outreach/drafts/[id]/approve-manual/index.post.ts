import { z } from "zod";
import { ok, parseBody, route } from "~~/server/lib/api";
import { approveForManualSend } from "~~/server/lib/outreach/send";

const bodySchema = z.object({
  /** Required, and must be literally true: approval is never implied. */
  approve: z.literal(true),
});

/**
 * Approves a draft the app cannot send itself — a LINKEDIN one — and creates
 * the follow-up task to send it by hand. The non-EMAIL branch of
 * `approveAndSendAction` (`src/app/(app)/outreach/actions.ts`).
 *
 * It is a separate endpoint rather than a flag on `/approve` because that one
 * is the single path that can put a message on the wire; nothing here sends.
 * `approveForManualSend` throws `HttpError("Draft not found", 404)` itself.
 */
export default route(async (event, { user, params }) => {
  await parseBody(event, bodySchema);
  const draft = await approveForManualSend({
    userId: user.id,
    draftId: params.id,
  });
  return ok({ id: draft.id, status: draft.status });
});
