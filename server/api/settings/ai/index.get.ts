import { ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";

/**
 * The three Prisma reads `AiSettingsPage` (`settings/ai/page.tsx`) did.
 *
 * `groupBy` is flattened to `{ agent, status, count }` so the page does not have
 * to know about Prisma's `_count._all` shape; the per-agent success/failed
 * lookup on the page is otherwise unchanged.
 */
export default route(async (_event, { user }) => {
  const [byAgent, recent, failures] = await Promise.all([
    prisma.aiRun.groupBy({
      by: ["agent", "status"],
      where: { userId: user.id },
      _count: { _all: true },
    }),
    prisma.aiRun.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        agent: true,
        status: true,
        model: true,
        latencyMs: true,
        createdAt: true,
        error: true,
      },
    }),
    prisma.aiRun.count({ where: { userId: user.id, status: "FAILED" } }),
  ]);

  return ok({
    byAgent: byAgent.map((row) => ({
      agent: row.agent,
      status: row.status,
      count: row._count._all,
    })),
    recent,
    failures,
  });
});
