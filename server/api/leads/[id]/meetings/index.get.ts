import { notFound, ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";

/**
 * The meetings tab's query, from
 * `src/app/(app)/leads/[id]/meetings/page.tsx` — newest first, with every note
 * and summary. Read-only: briefs and summaries are produced by the discovery
 * work stream.
 */
export default route(async (_event, { user, params }) => {
  const lead = await prisma.lead.findFirst({
    where: { id: params.id, userId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (!lead) notFound("Lead");

  const meetings = await prisma.meeting.findMany({
    where: { leadId: params.id },
    orderBy: { scheduledAt: "desc" },
    include: {
      notes: { orderBy: { createdAt: "asc" } },
      summaries: { orderBy: { createdAt: "desc" } },
    },
  });

  return ok(meetings);
});
