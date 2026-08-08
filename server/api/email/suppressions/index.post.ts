import { z } from "zod";
import { ok, parseBody, route } from "~~/server/lib/api";
import { audit } from "~~/server/lib/audit";
import { normaliseEmail, suppress } from "~~/server/lib/compliance";

const body = z.object({
  email: z.string().min(3),
  reason: z
    .enum(["UNSUBSCRIBED", "BOUNCED", "COMPLAINT", "DO_NOT_CONTACT", "MANUAL"])
    .default("MANUAL"),
  detail: z.string().optional(),
});

/** Adding an address here permanently stops every send path (plan §37). */
export default route(async (event, { user }) => {
  const input = await parseBody(event, body);
  await suppress(input.email, input.reason, input.detail);
  await audit({
    userId: user.id,
    actorType: "HUMAN",
    action: "suppression.add",
    entityType: "suppression_entry",
    entityId: normaliseEmail(input.email),
    metadata: { reason: input.reason },
  });
  return ok({ email: normaliseEmail(input.email), reason: input.reason }, { status: 201 });
});
