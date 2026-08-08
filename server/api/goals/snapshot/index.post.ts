import { ok, route } from "~~/server/lib/api";
import { snapshotGoalProgress } from "~~/server/lib/goals/queries";

/**
 * Writes a GoalProgress row for every active goal's current window. The nightly
 * job calls this so a closed period keeps its final number even after the
 * window rolls over (plan §6).
 */
export default route(async (_event, { user }) => {
  const goals = await snapshotGoalProgress(user.id);
  return ok({ snapshots: goals.length });
});
