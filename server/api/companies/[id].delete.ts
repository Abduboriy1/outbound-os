import { ok, route } from "~~/server/lib/api";
import { deleteCompany } from "~~/server/lib/leads/mutations";

export default route(async (_event, { user, params }) => {
  await deleteCompany({ userId: user.id }, params.id);
  return ok({ deleted: true });
});
