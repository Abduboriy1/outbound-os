import { notFound, ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";
import {
  listLeadActivities,
  listLeadStageHistory,
} from "~~/server/lib/leads/queries";

/**
 * The activity tab's two reads, from
 * `src/app/(app)/leads/[id]/activity/page.tsx`: every recorded event on the
 * lead (`listLeadActivities`, 200 rows) and the stage history.
 *
 * `GET /api/leads/:id` carries only the 8 most recent activities as part of its
 * overview payload, which is what the tab had been falling back to.
 */
export default route(async (_event, { user, params }) => {
  const lead = await prisma.lead.findFirst({
    where: { id: params.id, userId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (!lead) notFound("Lead");

  const [activities, history] = await Promise.all([
    listLeadActivities(user.id, params.id),
    listLeadStageHistory(params.id),
  ]);

  return ok({ activities, history });
});
