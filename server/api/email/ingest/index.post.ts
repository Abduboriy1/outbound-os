import { z } from "zod";
import { ok, parseBody, route } from "~~/server/lib/api";
import { ingestReplies } from "~~/server/lib/outreach/ingest";

const body = z
  .object({ since: z.iso.datetime().optional() })
  .optional()
  .default({});

/**
 * Polls the email provider and runs reply intelligence (plan §18). Any reply
 * the agent drafts is stored as a draft awaiting approval.
 */
export default route(async (event, { user }) => {
  const input = await parseBody(event, body).catch(() => ({}) as { since?: string });
  return ok(
    await ingestReplies(user.id, {
      since: input.since ? new Date(input.since) : undefined,
    }),
  );
});
