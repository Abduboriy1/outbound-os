import { z } from "zod";
import { ok, parseBody, route } from "~~/server/lib/api";
import { OUTREACH_VARIANTS } from "~~/server/lib/ai/agents/outreach";
import { generateDraft } from "~~/server/lib/outreach/generate";

const body = z.object({
  leadId: z.string().min(1),
  variant: z.enum(OUTREACH_VARIANTS).default("EMAIL"),
  reason: z.string().optional(),
});

/** Queues a draft for approval. It never sends. */
export default route(async (event, { user }) => {
  const input = await parseBody(event, body);
  const { draft } = await generateDraft({
    userId: user.id,
    leadId: input.leadId,
    variant: input.variant,
    reason: input.reason ?? null,
  });
  return ok({ id: draft.id, status: draft.status }, { status: 201 });
});
