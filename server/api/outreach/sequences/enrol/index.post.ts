import { z } from "zod";
import { HttpError, ok, parseBody, route } from "~~/server/lib/api";
import { enrolLead } from "~~/server/lib/outreach/sequences";

const bodySchema = z.object({
  sequenceId: z.string().min(1),
  leadId: z.string().min(1),
});

/**
 * Port of `enrolLeadAction` (`src/app/(app)/outreach/actions.ts`). `enrolLead`
 * scopes the sequence to the caller and throws a plain `Error("Sequence not
 * found")` when it is not theirs; that becomes a 404 rather than a 500.
 */
export default route(async (event, { user }) => {
  const input = await parseBody(event, bodySchema);
  try {
    return ok(
      await enrolLead({
        userId: user.id,
        sequenceId: input.sequenceId,
        leadId: input.leadId,
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Sequence not found") {
      throw new HttpError("Sequence not found", 404);
    }
    throw error;
  }
});
