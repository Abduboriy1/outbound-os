import { notFound, ok, route } from "~~/server/lib/api";
import { getTask } from "~~/server/lib/leads/queries";

export default route(async (_event, { user, params }) => {
  const task = await getTask(user.id, params.id);
  if (!task) notFound("Task");
  return ok(task);
});
