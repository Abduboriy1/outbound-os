import { ok, route } from "~~/server/lib/api";
import { sweepFollowUps } from "~~/server/lib/outreach/followups";

/** Creates the missing next actions. Tasks only - nothing is contacted. */
export default route(async (_event, { user }) => ok(await sweepFollowUps(user.id)));
