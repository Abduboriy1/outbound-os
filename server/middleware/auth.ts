import { defineEventHandler, getCookie, getRequestURL, sendRedirect } from "h3";
import { SESSION_COOKIE } from "~~/server/lib/auth";

/**
 * Ported from the Next app's `src/middleware.ts`.
 *
 * Cheap cookie-presence gate. It only keeps signed-out visitors off the app
 * shell — every route handler still verifies the JWT via `requireUser()`, so a
 * forged cookie gains nothing.
 *
 * The Next matcher was `/((?!api|_next/static|_next/image|favicon.ico).*)`;
 * `SKIP` below is the same exclusion list translated to Nitro's asset paths.
 * `/api` in particular must stay excluded: `/api/intake` authenticates with a
 * bearer token rather than a session.
 */

export const PUBLIC_PATHS = ["/login", "/register"];

const SKIP = ["/api/", "/_nuxt/", "/__nuxt", "/_ipx/", "/_scripts/", "/favicon.ico"];

export default defineEventHandler((event) => {
  const { pathname } = getRequestURL(event);

  if (pathname === "/api" || SKIP.some((prefix) => pathname.startsWith(prefix))) return;
  // Static files served from public/ (svg, ico, txt, ...).
  if (/\.[a-z0-9]+$/i.test(pathname)) return;

  const hasSession = Boolean(getCookie(event, SESSION_COOKIE));

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    if (hasSession) return sendRedirect(event, "/", 307);
    return;
  }

  if (!hasSession) {
    return sendRedirect(event, `/login?next=${encodeURIComponent(pathname)}`, 307);
  }
});
