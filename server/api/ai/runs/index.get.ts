import { z } from "zod";
import { ok, parseQuery, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";

const querySchema = z.object({
  leadId: z.string().optional(),
  agent: z.string().optional(),
  status: z.enum(["PENDING", "RUNNING", "SUCCESS", "FAILED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  /** Raw text and input are large; omitted unless asked for. */
  verbose: z.coerce.boolean().default(false),
});

/** AI run history (plan §31: every call is recorded and inspectable). */
export default route(async (event, { user }) => {
  const query = parseQuery(event, querySchema);

  const runs = await prisma.aiRun.findMany({
    where: {
      userId: user.id,
      ...(query.leadId ? { leadId: query.leadId } : {}),
      ...(query.agent ? { agent: query.agent } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: query.limit,
    select: {
      id: true,
      agent: true,
      status: true,
      provider: true,
      model: true,
      leadId: true,
      error: true,
      promptTokens: true,
      completionTokens: true,
      latencyMs: true,
      createdAt: true,
      output: true,
      ...(query.verbose ? { input: true, rawText: true } : {}),
      feedback: { select: { id: true, rating: true, comment: true, createdAt: true } },
    },
  });

  return ok(runs);
});
