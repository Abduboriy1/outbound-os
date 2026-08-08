import { ok, publicRoute } from "~~/server/lib/api";
import { getCurrentUser } from "~~/server/lib/auth";

/**
 * The signed-in user, or `null`. Replaces the `getCurrentUser()` call that the
 * Next `(app)` layout made directly on the server; in Nuxt the shell is a
 * client-visible layout, so it reads the session over HTTP instead.
 */
export default publicRoute(async (event) => ok(await getCurrentUser(event)));
