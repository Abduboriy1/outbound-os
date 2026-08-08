import { ok, route } from "~~/server/lib/api";
import { deleteLead } from "~~/server/lib/leads/mutations";

export default route(async (_event, { user, params }) => {
  await deleteLead({ userId: user.id }, params.id);
  return ok({ deleted: true });
});
