import { ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";
import { AUTOMATION_KEYS } from "~~/shared/settings/automation-keys";
import type { ApprovalMode } from "~~/server/generated/prisma/client";

/**
 * `AutomationSettingsPage` (`settings/automation/page.tsx`) built the
 * `key -> mode` map by starting from the defaults and overlaying the saved
 * rows. Same two steps, on the server, so the form receives one flat record.
 */
export default route(async (_event, { user }) => {
  const rows = await prisma.automationSetting.findMany({ where: { userId: user.id } });

  const current: Record<string, ApprovalMode> = Object.fromEntries(
    AUTOMATION_KEYS.map((automation) => [automation.key, automation.default]),
  );
  for (const row of rows) current[row.key] = row.mode;

  return ok({ current });
});
