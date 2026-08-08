import { ok, parseBody, route } from "~~/server/lib/api";
import { updateContact } from "~~/server/lib/leads/mutations";
import { contactInputSchema } from "~~/server/lib/leads/schemas";

export default route(async (event, { user, params }) => {
  const input = await parseBody(event, contactInputSchema);
  return ok(await updateContact({ userId: user.id }, params.id, input));
});
