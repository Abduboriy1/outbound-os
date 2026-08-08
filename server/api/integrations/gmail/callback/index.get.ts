import { getQuery, sendRedirect } from "h3";
import { HttpError, route } from "~~/server/lib/api";
import { audit } from "~~/server/lib/audit";
import { env } from "~~/server/lib/env";
import { completeGmailAuth } from "~~/server/lib/email/providers/gmail";

/**
 * OAuth callback. Tokens are exchanged server-side and stored only through
 * `seal()` — they never reach the browser and never hit the database in
 * plaintext (plan §36).
 */
export default route(async (event, { user }) => {
  const query = getQuery(event);
  const error = typeof query.error === "string" ? query.error : null;
  if (error) {
    return sendRedirect(
      event,
      `${env().APP_URL}/settings?gmail=denied&reason=${encodeURIComponent(error)}`,
      307,
    ) as unknown as Response;
  }

  const code = typeof query.code === "string" ? query.code : null;
  if (!code) throw new HttpError("Missing authorisation code", 400);

  // The state we issued was the user id. It must match the live session, so a
  // callback replayed into someone else's browser cannot bind their mailbox.
  const state = typeof query.state === "string" ? query.state : null;
  if (state && state !== user.id) {
    throw new HttpError("Authorisation state does not match this session", 400);
  }

  const { emailAddress } = await completeGmailAuth(user.id, code);

  await audit({
    userId: user.id,
    actorType: "HUMAN",
    action: "integration.gmail.connect",
    entityType: "integration",
    metadata: { emailAddress },
  });

  return sendRedirect(
    event,
    `${env().APP_URL}/settings?gmail=connected`,
    307,
  ) as unknown as Response;
});
