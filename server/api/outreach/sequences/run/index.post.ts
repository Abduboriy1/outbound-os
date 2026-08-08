import { ok, route } from "~~/server/lib/api";
import { runSequences } from "~~/server/lib/outreach/sequences";

/**
 * Advances due sequence steps (plan §23). Called by the scheduler or by hand.
 * It only ever produces drafts for the approval queue.
 */
export default route(async (_event, { user }) => ok(await runSequences(user.id)));
