import { z } from "zod";
import { HttpError, notFound, ok, parseBody, route } from "~~/server/lib/api";
import { enqueue } from "~~/server/lib/queue";
import { createPendingReport, LeadNotFoundError } from "~~/server/lib/research/pipeline";

const startSchema = z.object({ leadId: z.string().min(1) });

/**
 * Starts research for a lead. Returns as soon as the report row exists — the
 * work happens on the queue, or inline when Redis is down (plan §34).
 */
export default route(async (event, { user }) => {
  const { leadId } = await parseBody(event, startSchema);

  let reportId: string;
  try {
    reportId = await createPendingReport({ leadId, userId: user.id });
  } catch (error) {
    if (error instanceof LeadNotFoundError) notFound("Lead");
    throw error;
  }

  const queued = await enqueue("research", { leadId, userId: user.id, reportId });
  if (queued.mode === "inline" && queued.error) {
    throw new HttpError(`Research failed: ${queued.error}`, 500);
  }

  return ok({ reportId, mode: queued.mode, jobId: queued.jobId ?? null }, { status: 202 });
});
