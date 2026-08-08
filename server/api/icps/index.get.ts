import { ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";

export default route(async (_event, { user }) => {
  const icps = await prisma.icp.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: { rules: true, _count: { select: { leads: true } } },
  });
  return ok(icps);
});
