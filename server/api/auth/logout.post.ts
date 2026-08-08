import { ok, publicRoute } from "~~/server/lib/api";
import { destroySession } from "~~/server/lib/auth";

/** Replaces the Next server action `logoutAction`. */
export default publicRoute((event) => {
  destroySession(event);
  return ok({ signedOut: true });
});
