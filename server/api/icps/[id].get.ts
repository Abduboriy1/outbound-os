import { notFound, ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";

export default route(async (_event, { user, params }) => {
  const icp = await prisma.icp.findFirst({
    where: { id: params.id, userId: user.id, deletedAt: null },
    include: { rules: true },
  });
  if (!icp) notFound("ICP");
  return ok(icp);
});
