import { sendRedirect } from "h3";
import { route } from "~~/server/lib/api";
import { audit } from "~~/server/lib/audit";
import { gmailAuthUrl } from "~~/server/lib/email/providers/gmail";

/**
 * Begins the Gmail OAuth flow (plan §35). `state` carries the user id so the
 * callback can attribute the tokens; the callback also re-checks the session,
 * so a forged state alone gets nobody anywhere.
 */
export default route(async (event, { user }) => {
  const url = gmailAuthUrl(user.id);
  await audit({
    userId: user.id,
    actorType: "HUMAN",
    action: "integration.gmail.start",
    entityType: "integration",
  });
  return sendRedirect(event, url, 307) as unknown as Response;
});
