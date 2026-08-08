import { ok, route } from "~~/server/lib/api";
import { inboxThreads } from "~~/server/lib/outreach/queries";

/**
 * Plan §18 — threads with lead context and the AI classification, newest first.
 * `src/app/(app)/outreach/inbox/page.tsx` called `inboxThreads` directly; this
 * exposes the same read model unchanged.
 */
export default route(async (_event, { user }) => ok(await inboxThreads(user.id)));
