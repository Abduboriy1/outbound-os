import { z } from "zod";
import { ok, parseBody, route } from "~~/server/lib/api";
import { rejectDraft } from "~~/server/lib/outreach/send";

const body = z.object({ reason: z.string().min(1) });

export default route(async (event, { user, params }) => {
  const input = await parseBody(event, body);
  const draft = await rejectDraft({
    userId: user.id,
    draftId: params.id,
    reason: input.reason,
  });
  return ok({ id: draft.id, status: draft.status });
});
