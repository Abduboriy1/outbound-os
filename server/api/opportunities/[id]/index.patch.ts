import { z } from "zod";
import { notFound, ok, parseBody, route } from "~~/server/lib/api";
import { audit } from "~~/server/lib/audit";
import { prisma } from "~~/server/lib/db";

const OPPORTUNITY_STATUSES = ["OPEN", "ACCEPTED", "REJECTED", "PARKED"] as const;

const bodySchema = z.object({ status: z.enum(OPPORTUNITY_STATUSES) });

/**
 * Port of `setOpportunityStatusAction` (`src/app/(app)/opportunities/actions.ts`).
 *
 * The server action returned silently on an unknown status or a missing
 * opportunity because a form post has nowhere to report to. An endpoint does,
 * so those two become 422 (zod) and 404 respectively; everything written is
 * unchanged — the same status update and the same `opportunity.status` audit
 * row. `revalidatePath` has no equivalent; the page refreshes its own fetch.
 */
export default route(async (event, { user, params }) => {
  const { status } = await parseBody(event, bodySchema);

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: params.id, lead: { userId: user.id, deletedAt: null } },
    select: { id: true },
  });
  if (!opportunity) notFound("Opportunity");

  const updated = await prisma.opportunity.update({
    where: { id: params.id },
    data: { status },
  });
  await audit({
    userId: user.id,
    action: "opportunity.status",
    entityType: "Opportunity",
    entityId: params.id,
    metadata: { status },
  });

  return ok(updated);
});
