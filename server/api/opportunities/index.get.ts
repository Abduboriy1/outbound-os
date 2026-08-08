import { ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";

/**
 * Plan §11 — the AI's argument for why a company should care, strongest first.
 *
 * Verbatim port of the `prisma.opportunity.findMany` in
 * `src/app/(app)/opportunities/page.tsx`.
 */
export default route(async (_event, { user }) => {
  const opportunities = await prisma.opportunity.findMany({
    where: { lead: { userId: user.id, deletedAt: null } },
    orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      company: { select: { name: true, industry: true } },
      lead: { select: { id: true, stage: true, overallScore: true } },
      roi: { select: { prospectSupplied: true } },
    },
  });

  return ok(opportunities);
});
