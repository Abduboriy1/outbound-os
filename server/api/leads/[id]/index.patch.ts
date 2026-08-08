import { ok, parseBody, route } from "~~/server/lib/api";
import { updateLead } from "~~/server/lib/leads/mutations";
import { leadInputSchema } from "~~/server/lib/leads/schemas";

export default route(async (event, { user, params }) => {
  const input = await parseBody(event, leadInputSchema);
  return ok(await updateLead({ userId: user.id }, params.id, input));
});
