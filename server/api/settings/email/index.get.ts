import { ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";
import { startOfUtcDay } from "~~/server/lib/compliance";
import { computeOutreachStats } from "~~/server/lib/analytics/outreach";
import { loadOutreachRows } from "~~/server/lib/analytics/queries";

/**
 * What `EmailSettingsPage` (`settings/email/page.tsx`) read as a server
 * component: today's send count against the ceiling, and the outreach summary
 * the three rate tiles come from. `/api/analytics` reports the same numbers but
 * as part of a much larger payload, so this stays a page-shaped endpoint.
 */
export default route(async (_event, { user }) => {
  const now = new Date();

  const [compliance, sentToday, outreach] = await Promise.all([
    prisma.complianceSetting.findUnique({ where: { userId: user.id } }),
    prisma.outreachDraft.count({
      where: {
        lead: { userId: user.id, deletedAt: null },
        status: "SENT",
        sentAt: { gte: startOfUtcDay(now) },
      },
    }),
    loadOutreachRows(user.id),
  ]);

  const stats = computeOutreachStats(outreach.sent, outreach.replies, outreach.optOuts);

  return ok({
    dailySendLimit: compliance?.dailySendLimit ?? 50,
    senderEmail: compliance?.senderEmail ?? null,
    sentToday,
    stats,
  });
});
