import { ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";

/**
 * Archived goals — the inactive `Goal` rows `src/app/(app)/goals/page.tsx` read
 * directly. `GET /api/goals` returns `loadGoalsWithProgress`, which is active
 * goals only, so this is the other half of that page.
 */
export default route(async (_event, { user }) => {
  const archived = await prisma.goal.findMany({
    where: { userId: user.id, isActive: false },
    orderBy: { updatedAt: "desc" },
    select: { id: true, metric: true, period: true, target: true },
  });

  return ok(archived);
});
