import { ok, route } from "~~/server/lib/api";
import { deleteContact } from "~~/server/lib/leads/mutations";

export default route(async (_event, { user, params }) => {
  await deleteContact({ userId: user.id }, params.id);
  return ok({ deleted: true });
});
