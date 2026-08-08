import { notFound, ok, route } from "~~/server/lib/api";
import { getCompany } from "~~/server/lib/leads/queries";

export default route(async (_event, { user, params }) => {
  const company = await getCompany(user.id, params.id);
  if (!company) notFound("Company");
  return ok(company);
});
