import { ok, route } from "~~/server/lib/api";
import { env } from "~~/server/lib/env";
import { gmailConnection } from "~~/server/lib/email/providers/gmail";

export default route(async (_event, { user }) => {
  const connection = await gmailConnection(user.id);
  return ok({
    ...connection,
    activeProvider: env().EMAIL_PROVIDER,
    clientConfigured: Boolean(
      env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET,
    ),
    redirectUri: env().GOOGLE_REDIRECT_URI,
  });
});
