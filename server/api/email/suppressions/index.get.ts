import { ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";
import { audit } from "~~/server/lib/audit";

export default route(async (_event, { user }) => {
  const entries = await prisma.suppressionEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  await audit({
    userId: user.id,
    action: "suppression.list",
    entityType: "suppression_entry",
  });
  return ok(entries);
});
