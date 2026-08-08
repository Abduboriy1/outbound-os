import { notFound, ok, route } from "~~/server/lib/api";
import { audit } from "~~/server/lib/audit";
import { prisma } from "~~/server/lib/db";

export default route(async (_event, { user, params }) => {
  const icp = await prisma.icp.findFirst({
    where: { id: params.id, userId: user.id, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!icp) notFound("ICP");

  // Soft delete: leads keep pointing at the profile they were scored against.
  await prisma.icp.update({
    where: { id: icp.id },
    data: { deletedAt: new Date(), isDefault: false },
  });
  await audit({
    userId: user.id,
    action: "icp.deleted",
    entityType: "Icp",
    entityId: icp.id,
    metadata: { name: icp.name },
  });
  return ok({ id: icp.id });
});
