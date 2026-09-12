/**
 * GET /api/debug/logs — recent third-party request logs, newest first.
 *
 * Query params:
 *   provider  filter, e.g. gemini | anthropic | brave | serper | fetch
 *   errors    "1" to show failures only
 *   limit     rows to return (default 100, max 500)
 */

import { z } from "zod";
import { ok, parseQuery, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";

const querySchema = z.object({
  provider: z.string().optional(),
  errors: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export default route(async (event) => {
  const query = parseQuery(event, querySchema);

  const logs = await prisma.debugLog.findMany({
    where: {
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.errors === "1" ? { ok: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: query.limit,
  });

  return ok(logs);
});
