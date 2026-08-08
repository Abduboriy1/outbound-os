import { z } from "zod";
import { ok, parseQuery, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";

const listSchema = z.object({
  aiRunId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export default route(async (event, { user }) => {
  const query = parseQuery(event, listSchema);
  const feedback = await prisma.aiFeedback.findMany({
    where: {
      aiRun: { userId: user.id, ...(query.aiRunId ? { id: query.aiRunId } : {}) },
    },
    orderBy: { createdAt: "desc" },
    take: query.limit,
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      aiRun: { select: { id: true, agent: true, leadId: true } },
    },
  });
  return ok(feedback);
});
