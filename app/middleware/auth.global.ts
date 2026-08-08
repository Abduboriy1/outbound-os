/**
 * Client-side half of the auth gate.
 *
 * `server/middleware/auth.ts` covers full page loads, but a client-side route
 * change never reaches the server, so the same rule is repeated here. It reads
 * the session user from `useSession()`, which is populated once per request and
 * shared through `useState`.
 *
 * This is a redirect for tidiness only. Nothing is trusted client-side: every
 * API route re-verifies the JWT.
 */
const PUBLIC_PATHS = ['/login', '/register']

export default defineNuxtRouteMiddleware(async (to) => {
  const { user, fetchSession } = useSession()

  if (user.value === undefined) await fetchSession()

  const isPublic = PUBLIC_PATHS.some(p => to.path.startsWith(p))

  if (isPublic) {
    if (user.value) return navigateTo('/')
    return
  }

  if (!user.value) {
    return navigateTo(`/login?next=${encodeURIComponent(to.fullPath)}`)
  }
})
