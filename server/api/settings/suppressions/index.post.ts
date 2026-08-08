import { z } from "zod";
import { fail, ok, parseBody, route } from "~~/server/lib/api";
import { audit } from "~~/server/lib/audit";
import { prisma } from "~~/server/lib/db";
import { normaliseEmail } from "~~/server/lib/compliance";

/**
 * Port of `addSuppressionAction`.
 *
 * `/api/email/suppressions` (POST) already adds an address, but through
 * `suppress()` and with different validation and error strings. This keeps the
 * settings form's own two messages ("Enter a valid email address and reason",
 * "Enter a valid email address") and its upsert semantics byte-identical to the
 * server action the form used to call.
 */
const suppressionSchema = z.object({
  email: z.string().trim().max(320),
  reason: z.enum(["UNSUBSCRIBED", "BOUNCED", "COMPLAINT", "DO_NOT_CONTACT", "MANUAL"]),
  detail: z.string().trim().max(300).optional(),
});

export default route(async (event, { user }) => {
  const parsed = suppressionSchema.safeParse(await parseBody(event, z.unknown()));
  if (!parsed.success) return fail("Enter a valid email address and reason", 422);

  const email = normaliseEmail(parsed.data.email);
  if (!email) return fail("Enter a valid email address", 422);

  await prisma.suppressionEntry.upsert({
    where: { email },
    create: { email, reason: parsed.data.reason, detail: parsed.data.detail || null },
    update: { reason: parsed.data.reason, detail: parsed.data.detail || null },
  });

  await audit({
    userId: user.id,
    action: "suppression.added",
    entityType: "SuppressionEntry",
    metadata: { reason: parsed.data.reason },
  });

  return ok({ saved: true });
});
