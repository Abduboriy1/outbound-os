import { ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";
import type { ApprovalMode } from "~~/server/generated/prisma/client";

/**
 * The three Prisma reads `SettingsOverviewPage` (`settings/page.tsx`) did as a
 * server component. Provider status is a separate concern and is fetched from
 * `/api/settings/providers`.
 */
export default route(async (_event, { user }) => {
  const [compliance, automations, suppressed] = await Promise.all([
    prisma.complianceSetting.findUnique({ where: { userId: user.id } }),
    prisma.automationSetting.findMany({ where: { userId: user.id } }),
    prisma.suppressionEntry.count(),
  ]);

  const modes: Record<string, ApprovalMode> = {};
  for (const row of automations) modes[row.key] = row.mode;

  return ok({
    compliance: compliance
      ? {
          senderName: compliance.senderName,
          senderEmail: compliance.senderEmail,
          physicalAddress: compliance.physicalAddress,
          dailySendLimit: compliance.dailySendLimit,
        }
      : null,
    modes,
    suppressed,
  });
});
