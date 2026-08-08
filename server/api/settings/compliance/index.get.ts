import { ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";

/**
 * What `CompliancePage` (`settings/compliance/page.tsx`) read. The fallbacks the
 * source applied while building `initial` (the user's own name and email, the
 * default opt-out line, a 50/day ceiling) are applied here so the page renders
 * the same values without needing the user record.
 */
export default route(async (_event, { user }) => {
  const [compliance, suppressions] = await Promise.all([
    prisma.complianceSetting.findUnique({ where: { userId: user.id } }),
    prisma.suppressionEntry.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
  ]);

  return ok({
    initial: {
      senderName: compliance?.senderName ?? user.name,
      senderEmail: compliance?.senderEmail ?? user.email,
      physicalAddress: compliance?.physicalAddress ?? "",
      unsubscribeText:
        compliance?.unsubscribeText ?? "Reply STOP and I won't contact you again.",
      dailySendLimit: compliance?.dailySendLimit ?? 50,
    },
    suppressions,
  });
});
