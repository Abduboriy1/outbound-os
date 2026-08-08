import { ok, parseBody, route } from "~~/server/lib/api";
import { setNextAction } from "~~/server/lib/leads/mutations";
import { nextActionSchema } from "~~/server/lib/leads/schemas";

/**
 * Port of `setNextActionAction` (`src/app/(app)/leads/actions.ts`) and of
 * `clearNextActionAction` (`src/app/(app)/tasks/actions.ts`), which differ only
 * in the values they pass.
 *
 * `PATCH /api/leads/:id` is not a substitute: it parses the whole
 * `leadInputSchema`, so a partial body would reset `sourceType` and the
 * estimated value range to their defaults. This endpoint parses the source's
 * own `nextActionSchema` and calls the same `setNextAction` mutation, so the
 * `NEXT_ACTION_SET` / `NEXT_ACTION_CLEARED` activity and the `lead.next_action`
 * audit row are written exactly as before.
 */
export default route(async (event, { user, params }) => {
  const input = await parseBody(event, nextActionSchema);
  return ok(await setNextAction({ userId: user.id }, params.id, input));
});
