import { ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";

/**
 * The connected-accounts table on `settings/integrations/page.tsx`.
 * `/api/integrations/gmail/status` only covers the Gmail connection; this is the
 * full list, with the credential count the source rendered.
 */
export default route(async (_event, { user }) => {
  const integrations = await prisma.integration.findMany({
    where: { userId: user.id },
    orderBy: { kind: "asc" },
    include: { _count: { select: { credentials: true } } },
  });

  return ok(
    integrations.map((integration) => ({
      id: integration.id,
      kind: integration.kind,
      provider: integration.provider,
      isEnabled: integration.isEnabled,
      credentialCount: integration._count.credentials,
      updatedAt: integration.updatedAt,
    })),
  );
});
