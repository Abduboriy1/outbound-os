import { ok, route } from "~~/server/lib/api";
import { deleteTask } from "~~/server/lib/leads/mutations";

export default route(async (_event, { user, params }) => {
  await deleteTask({ userId: user.id }, params.id);
  return ok({ deleted: true });
});
