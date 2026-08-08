import { ok, parseBody, route } from "~~/server/lib/api";
import { updateCompany } from "~~/server/lib/leads/mutations";
import { companyInputSchema } from "~~/server/lib/leads/schemas";

export default route(async (event, { user, params }) => {
  const input = await parseBody(event, companyInputSchema);
  return ok(await updateCompany({ userId: user.id }, params.id, input));
});
