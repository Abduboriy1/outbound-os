import { notFound, ok, route } from "~~/server/lib/api";
import { threadDetail } from "~~/server/lib/outreach/queries";

/**
 * One thread with every message in send order — the read model
 * `src/app/(app)/outreach/inbox/[threadId]/page.tsx` used. Its `notFound()`
 * becomes a 404 with the §4.3 error body.
 */
export default route(async (_event, { user, params }) => {
  const thread = await threadDetail(user.id, params.threadId);
  if (!thread) notFound("Thread");
  return ok(thread);
});
