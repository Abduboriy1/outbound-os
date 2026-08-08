import { notFound, ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";

/**
 * The email tab's two queries, from `src/app/(app)/leads/[id]/emails/page.tsx`.
 * Read-only: sending, drafting and reply analysis belong to the outreach
 * stream. The lead is looked up first for the same reason the page did —
 * `notFound()` for anything that is not the caller's.
 */
export default route(async (_event, { user, params }) => {
  const lead = await prisma.lead.findFirst({
    where: { id: params.id, userId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (!lead) notFound("Lead");

  const [threads, drafts] = await Promise.all([
    prisma.emailThread.findMany({
      where: { leadId: params.id },
      orderBy: { lastMessageAt: "desc" },
      include: { messages: { orderBy: { sentAt: "asc" } } },
    }),
    prisma.outreachDraft.findMany({
      where: { leadId: params.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return ok({ threads, drafts });
});
