import { notFound, ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";

/**
 * The proposal tab's query, from
 * `src/app/(app)/leads/[id]/proposal/page.tsx` — proposals newest first, every
 * version newest first. Read-only: proposal generation belongs to the
 * deal-conversion stream.
 */
export default route(async (_event, { user, params }) => {
  const lead = await prisma.lead.findFirst({
    where: { id: params.id, userId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (!lead) notFound("Lead");

  const proposals = await prisma.proposal.findMany({
    where: { leadId: params.id },
    orderBy: { createdAt: "desc" },
    include: { versions: { orderBy: { version: "desc" } } },
  });

  return ok(proposals);
});
