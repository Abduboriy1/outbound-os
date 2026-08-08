import { z } from "zod";
import { ok, parseBody, route } from "~~/server/lib/api";
import { leadStageChangeSchema } from "~~/server/lib/leads/schemas";
import { changeLeadStage } from "~~/server/lib/leads/stage";

const body = leadStageChangeSchema.extend({
  actorType: z.enum(["HUMAN", "AI", "SYSTEM"]).default("HUMAN"),
  actorId: z.string().nullable().default(null),
});

/**
 * The stage endpoint other subsystems call. It shares the transition service
 * with the UI, so the do-not-contact rule and the history rows are identical.
 */
export default route(async (event, { user, params }) => {
  const input = await parseBody(event, body);
  const result = await changeLeadStage({
    userId: user.id,
    leadId: params.id,
    toStage: input.stage,
    reason: input.reason,
    actorType: input.actorType,
    actorId: input.actorId,
  });
  return ok(result);
});
