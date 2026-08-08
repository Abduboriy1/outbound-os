import { z } from "zod";
import { fail, ok, parseBody, route } from "~~/server/lib/api";
import { audit } from "~~/server/lib/audit";
import { prisma } from "~~/server/lib/db";
import { AUTOMATION_KEYS, allowedModes } from "~~/shared/settings/automation-keys";

/**
 * Port of `saveAutomationAction` (plan §38 — approval mode per automation type).
 *
 * The body replaces the action's `FormData`: one key per automation, exactly the
 * names the source's `<Select name={automation.key}>` posted. The guard is the
 * point of the whole endpoint and is unchanged — a mode that would send to a
 * prospect unattended is rejected here, not merely hidden in the dropdown — and
 * so is its message.
 */
export default route(async (event, { user }) => {
  const body = await parseBody(event, z.record(z.string(), z.unknown()));

  for (const automation of AUTOMATION_KEYS) {
    const raw = String(body[automation.key] ?? "");
    const mode = allowedModes(automation.reachesProspect).find((m) => m === raw);
    if (!mode) {
      return fail(`"${raw}" is not an allowed mode for ${automation.label}`, 422);
    }

    await prisma.automationSetting.upsert({
      where: { userId_key: { userId: user.id, key: automation.key } },
      create: { userId: user.id, key: automation.key, mode },
      update: { mode },
    });
  }

  await audit({
    userId: user.id,
    action: "settings.automation.saved",
    entityType: "AutomationSetting",
    metadata: Object.fromEntries(
      AUTOMATION_KEYS.map((a) => [a.key, String(body[a.key] ?? "")]),
    ),
  });

  return ok({ saved: true });
});
