import { ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";

/**
 * Goal progress snapshots, newest window first — the `prisma.goalProgress`
 * query in `src/app/(app)/goals/page.tsx`.
 *
 * The live window is returned too; the page filters it out by comparing
 * `periodStart` against the active goals, which is what the source did.
 */
export default route(async (_event, { user }) => {
  const history = await prisma.goalProgress.findMany({
    where: { goal: { userId: user.id } },
    orderBy: { periodStart: "desc" },
    take: 24,
    select: {
      id: true,
      periodStart: true,
      periodEnd: true,
      value: true,
      goal: { select: { metric: true, period: true, target: true } },
    },
  });

  return ok(history);
});
