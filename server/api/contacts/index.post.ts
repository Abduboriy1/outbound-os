import { ok, parseBody, route } from "~~/server/lib/api";
import { createContact } from "~~/server/lib/leads/mutations";
import { contactInputSchema } from "~~/server/lib/leads/schemas";

export default route(async (event, { user }) => {
  const input = await parseBody(event, contactInputSchema);
  return ok(await createContact({ userId: user.id }, input), { status: 201 });
});
