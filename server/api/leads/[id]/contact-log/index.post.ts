import { z } from "zod";
import { ok, parseBody, route } from "~~/server/lib/api";
import { logContactMade } from "~~/server/lib/leads/mutations";

const bodySchema = z.object({
  summary: z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, "Describe what happened"),
});

/**
 * Port of `logContactAction` (`src/app/(app)/leads/actions.ts`). Records that a
 * human spoke to the prospect without sending anything: `logContactMade` writes
 * the `CONTACT_LOGGED` activity and moves `lastContactedAt` / `lastActivityAt`
 * in one transaction.
 */
export default route(async (event, { user, params }) => {
  const { summary } = await parseBody(event, bodySchema);
  await logContactMade({ userId: user.id }, params.id, summary);
  return ok({ ok: true }, { status: 201 });
});
