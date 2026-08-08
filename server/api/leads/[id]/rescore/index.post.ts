import { notFound, ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";
import { enqueue } from "~~/server/lib/queue";

/**
 * Port of `rescoreLeadAction` (`src/app/(app)/research/queue/actions.ts`).
 * Queues a score recomputation without re-fetching any pages.
 *
 * The server action returned silently for an unknown lead; on an addressable
 * URL the lead is looked up scoped to the caller first, so somebody else's lead
 * answers 404 instead of being queued.
 */
export default route(async (_event, { user, params }) => {
  const lead = await prisma.lead.findFirst({
    where: { id: params.id, userId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (!lead) notFound("Lead");

  const queued = await enqueue("scoring", { leadId: lead.id, userId: user.id });
  return ok({ mode: queued.mode, error: queued.error ?? null }, { status: 202 });
});
