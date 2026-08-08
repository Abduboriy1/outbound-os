import { z } from "zod";
import { ok, parseBody, route } from "~~/server/lib/api";
import { audit } from "~~/server/lib/audit";
import { prisma } from "~~/server/lib/db";

/**
 * Port of `createSequenceAction` (`src/app/(app)/outreach/actions.ts`).
 *
 * The schema is the source's `sequenceSchema`, including its messages. The one
 * difference is that the steps arrive as JSON rather than as a JSON string in a
 * form field, so there is no `JSON.parse` step.
 */
const bodySchema = z.object({
  name: z.string().min(1, "Name the sequence"),
  description: z.string().optional(),
  steps: z
    .array(
      z.object({
        dayOffset: z.number().int().min(0).max(365),
        purpose: z.string().min(1),
        channel: z.enum(["EMAIL", "LINKEDIN"]),
      }),
    )
    .min(1, "A sequence needs at least one step"),
});

export default route(async (event, { user }) => {
  const input = await parseBody(event, bodySchema);

  const sequence = await prisma.emailSequence.create({
    data: {
      userId: user.id,
      name: input.name,
      description: input.description ?? null,
      steps: {
        create: input.steps.map((step) => ({
          dayOffset: step.dayOffset,
          purpose: step.purpose,
          channel: step.channel,
        })),
      },
    },
  });

  await audit({
    userId: user.id,
    action: "sequence.create",
    entityType: "email_sequence",
    entityId: sequence.id,
    metadata: { steps: input.steps.length },
  });

  return ok(sequence, { status: 201 });
});
