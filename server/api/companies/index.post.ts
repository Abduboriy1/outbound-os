import { ok, parseBody, route } from "~~/server/lib/api";
import { createCompany } from "~~/server/lib/leads/mutations";
import { companyInputSchema } from "~~/server/lib/leads/schemas";

export default route(async (event, { user }) => {
  const input = await parseBody(event, companyInputSchema);
  return ok(await createCompany({ userId: user.id }, input), { status: 201 });
});
