import { z } from "zod";
import { fail, ok, parseBody, route } from "~~/server/lib/api";
import { audit } from "~~/server/lib/audit";
import { prisma } from "~~/server/lib/db";
import { normaliseEmail } from "~~/server/lib/compliance";

/**
 * Port of `saveComplianceAction` from `src/app/(app)/settings/actions.ts`
 * (plan §37 — sender identity, opt-out wording and the daily send ceiling).
 *
 * The zod schema and both error strings are unchanged. The action returned
 * `{ error }` in-band and `revalidatePath`'d; here a bad field is a 422 whose
 * `{ error }` the form reads back, and the page refreshes its own `useFetch`.
 */
const complianceSchema = z.object({
  senderName: z.string().trim().max(120),
  senderEmail: z.string().trim().max(320),
  physicalAddress: z.string().trim().max(500),
  unsubscribeText: z.string().trim().min(1).max(300),
  dailySendLimit: z.coerce.number().int().min(0).max(1000),
});

export default route(async (event, { user }) => {
  const parsed = complianceSchema.safeParse(await parseBody(event, z.unknown()));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid settings", 422);
  }
  const data = parsed.data;

  if (data.senderEmail && !normaliseEmail(data.senderEmail)) {
    return fail("Sender email is not a valid address", 422);
  }

  await prisma.complianceSetting.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });

  await audit({
    userId: user.id,
    action: "settings.compliance.saved",
    entityType: "ComplianceSetting",
    entityId: user.id,
    metadata: { dailySendLimit: data.dailySendLimit },
  });

  return ok({ saved: true });
});
