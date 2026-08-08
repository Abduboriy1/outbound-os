import { ok, route } from "~~/server/lib/api";
import { audit } from "~~/server/lib/audit";
import { disconnectGmail } from "~~/server/lib/email/providers/gmail";

/** Disables the integration. Credentials stay sealed for the audit trail. */
export default route(async (_event, { user }) => {
  await disconnectGmail(user.id);
  await audit({
    userId: user.id,
    actorType: "HUMAN",
    action: "integration.gmail.disconnect",
    entityType: "integration",
  });
  return ok({ connected: false });
});
