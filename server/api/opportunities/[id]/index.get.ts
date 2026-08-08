import { notFound, ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";

/**
 * Verbatim port of the `prisma.opportunity.findFirst` in
 * `src/app/(app)/opportunities/[id]/page.tsx`. `notFound()` becomes a 404 with
 * the §4.3 error body.
 */
export default route(async (_event, { user, params }) => {
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: params.id, lead: { userId: user.id, deletedAt: null } },
    include: {
      company: {
        select: { id: true, name: true, industry: true, employeeCount: true },
      },
      lead: {
        select: { id: true, stage: true, overallScore: true, fitScore: true },
      },
      roi: true,
    },
  });
  if (!opportunity) notFound("Opportunity");

  return ok(opportunity);
});
