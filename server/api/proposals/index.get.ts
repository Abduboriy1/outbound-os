import { ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";

/**
 * Plan §24 — proposals, their newest version, and what they are worth.
 *
 * Verbatim port of the `prisma.proposal.findMany` in
 * `src/app/(app)/deals/proposals/page.tsx`. The page derives the outstanding
 * count and value from these rows itself, exactly as the server component did,
 * so nothing is aggregated here.
 */
export default route(async (_event, { user }) => {
  const proposals = await prisma.proposal.findMany({
    where: { lead: { userId: user.id, deletedAt: null } },
    orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      company: { select: { name: true } },
      lead: { select: { id: true, stage: true, wonAt: true, lostAt: true } },
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        select: { version: true, investmentMin: true, investmentMax: true },
      },
    },
  });

  return ok(proposals);
});
