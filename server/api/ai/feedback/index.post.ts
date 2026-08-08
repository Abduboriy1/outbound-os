import { z } from "zod";
import { notFound, ok, parseBody, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";

const createSchema = z.object({
  aiRunId: z.string().min(1),
  /** -1, 0, or 1: thumbs down, neutral, thumbs up. */
  rating: z.coerce.number().int().min(-1).max(1),
  comment: z.string().max(2000).optional(),
});

/**
 * Records human feedback on an AI run. This is the raw material for tuning
 * prompts later — which agents produce output the operator actually uses.
 */
export default route(async (event, { user }) => {
  const body = await parseBody(event, createSchema);

  const run = await prisma.aiRun.findFirst({
    where: { id: body.aiRunId, userId: user.id },
    select: { id: true },
  });
  if (!run) notFound("AI run");

  const feedback = await prisma.aiFeedback.create({
    data: { aiRunId: run.id, rating: body.rating, comment: body.comment ?? null },
    select: { id: true, rating: true, comment: true, createdAt: true },
  });

  return ok(feedback, { status: 201 });
});
