import { ok, parseBody, route } from "~~/server/lib/api";
import { setTaskStatus } from "~~/server/lib/leads/mutations";
import { taskStatusSchema } from "~~/server/lib/leads/schemas";

export default route(async (event, { user, params }) => {
  const { status } = await parseBody(event, taskStatusSchema);
  return ok(await setTaskStatus({ userId: user.id }, params.id, status));
});
