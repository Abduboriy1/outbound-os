import { ok, parseQuery, route } from "~~/server/lib/api";
import { taskFiltersSchema } from "~~/server/lib/leads/filters";
import { listTasks } from "~~/server/lib/leads/queries";

export default route(async (event, { user }) =>
  ok(await listTasks(user.id, parseQuery(event, taskFiltersSchema))),
);
