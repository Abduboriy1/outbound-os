import { ok, route } from "~~/server/lib/api";
import { audit } from "~~/server/lib/audit";
import { prisma } from "~~/server/lib/db";

/**
 * Port of `removeSuppressionAction`.
 *
 * Removal is deliberately restricted. An address that unsubscribed or
 * complained stays suppressed forever; only a manual entry or a bounce can be
 * lifted, and the removal is audited (plan §37). The action returned silently in
 * both refusal cases, so this does the same rather than inventing an error the
 * source never showed.
 */
export default route(async (_event, { user, params }) => {
  const id = String(params.id ?? "");
  const entry = await prisma.suppressionEntry.findUnique({ where: { id } });
  if (!entry) return ok({ removed: false });
  if (entry.reason === "UNSUBSCRIBED" || entry.reason === "COMPLAINT") {
    return ok({ removed: false });
  }

  await prisma.suppressionEntry.delete({ where: { id } });
  await audit({
    userId: user.id,
    action: "suppression.removed",
    entityType: "SuppressionEntry",
    entityId: id,
    metadata: { email: entry.email, reason: entry.reason },
  });

  return ok({ removed: true });
});
