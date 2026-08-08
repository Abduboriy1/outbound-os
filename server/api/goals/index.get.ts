import { ok, route } from "~~/server/lib/api";
import { loadGoalsWithProgress } from "~~/server/lib/goals/queries";

/** Goals with live progress (plan §6). Used by the UI and the nightly worker. */
export default route(async (_event, { user }) => {
  const goals = await loadGoalsWithProgress(user.id);
  return ok(goals);
});
