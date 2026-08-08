import { ok, parseBody, route } from "~~/server/lib/api";
import { createLead } from "~~/server/lib/leads/mutations";
import { leadInputSchema } from "~~/server/lib/leads/schemas";

export default route(async (event, { user }) => {
  const input = await parseBody(event, leadInputSchema);
  return ok(await createLead({ userId: user.id }, input), { status: 201 });
});
