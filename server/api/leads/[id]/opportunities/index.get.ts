import { notFound, ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";

/**
 * The opportunities tab's query, from
 * `src/app/(app)/leads/[id]/opportunities/page.tsx` — strongest first, each
 * with its ROI row. Read-only: opportunity generation belongs to the AI stream.
 */
export default route(async (_event, { user, params }) => {
  const lead = await prisma.lead.findFirst({
    where: { id: params.id, userId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (!lead) notFound("Lead");

  const opportunities = await prisma.opportunity.findMany({
    where: { leadId: params.id },
    orderBy: { confidence: "desc" },
    include: { roi: true },
  });

  return ok(opportunities);
});
