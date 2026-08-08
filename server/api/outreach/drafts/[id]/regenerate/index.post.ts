import { z } from "zod";
import { notFound, ok, parseBody, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";
import {
  OUTREACH_VARIANTS,
  REGENERATION_HINTS,
} from "~~/server/lib/ai/agents/outreach";
import { generateDraft } from "~~/server/lib/outreach/generate";

const bodySchema = z.object({ hint: z.enum(REGENERATION_HINTS) });

/**
 * Port of `regenerateDraftAction` (`src/app/(app)/outreach/actions.ts`).
 *
 * Composing this from `POST /api/outreach/drafts` + the reject endpoint
 * reproduced the visible outcome but dropped `regenerationHint`, so "Shorter"
 * regenerated without telling the model to be shorter. Here the hint and the
 * superseded draft both reach `generateDraft`, which feeds the previous
 * subject and body back to the agent as the thing to improve on.
 */
export default route(async (event, { user, params }) => {
  const { hint } = await parseBody(event, bodySchema);

  const draft = await prisma.outreachDraft.findFirst({
    where: { id: params.id, lead: { userId: user.id, deletedAt: null } },
  });
  if (!draft) notFound("Draft");

  const variant = (OUTREACH_VARIANTS as readonly string[]).includes(draft.variant)
    ? (draft.variant as (typeof OUTREACH_VARIANTS)[number])
    : "EMAIL";

  const { draft: replacement } = await generateDraft({
    userId: user.id,
    leadId: draft.leadId,
    variant,
    reason: draft.reason,
    regenerationOf: draft.id,
    regenerationHint: hint,
  });

  // The superseded draft leaves the queue but is kept for the audit trail.
  await prisma.outreachDraft.update({
    where: { id: draft.id },
    data: {
      status: "REJECTED",
      rejectedAt: new Date(),
      rejectionReason: `Regenerated (${hint})`,
    },
  });

  return ok({ id: replacement.id, status: replacement.status }, { status: 201 });
});
