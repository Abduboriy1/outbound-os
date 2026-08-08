import type { SessionUser } from '~~/server/lib/auth'

/**
 * The signed-in user, fetched once per request and shared by every component.
 *
 * The Next `(app)` layout called `getCurrentUser()` directly because it was a
 * server component. A Nuxt layout renders on both sides, so the session is read
 * through `/api/auth/session` and cached in `useState`, which serialises from
 * the server render into the client payload — one request, not one per page.
 *
 * `user.value` is `undefined` before the first fetch and `null` when signed out.
 */
export function useSession() {
  const user = useState<SessionUser | null | undefined>('session-user', () => undefined)

  /**
   * `useRequestFetch()` rather than plain `$fetch`.
   *
   * On the client the two are identical. On the server they are not: `$fetch`
   * issues an internal request carrying **no** headers, so `/api/auth/session`
   * saw no `ase_session` cookie, `getCurrentUser()` returned null, and
   * `auth.global.ts` bounced every authenticated hard page load to `/login`.
   * `useRequestFetch()` returns the Nitro request-scoped fetch, which forwards
   * the incoming request's headers — cookie included.
   *
   * This must be resolved here, in the composable body, while the Nuxt instance
   * is still available; the returned functions close over it.
   */
  const request = useRequestFetch()

  async function fetchSession() {
    const { data } = await request<{ data: SessionUser | null }>('/api/auth/session')
    user.value = data
    return data
  }

  /*
   * The three below are browser-only by construction, whichever fetch they use:
   * each depends on the endpoint's `Set-Cookie` reaching the browser, and a
   * cookie set on an internal SSR sub-request is swallowed by Nitro rather than
   * forwarded to the client. Call them from event handlers, never from setup.
   */

  async function login(email: string, password: string) {
    const { data } = await request<{ data: SessionUser }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    user.value = data
    return data
  }

  async function register(input: { name: string, email: string, password: string }) {
    const { data } = await request<{ data: SessionUser }>('/api/auth/register', {
      method: 'POST',
      body: input,
    })
    user.value = data
    return data
  }

  async function logout() {
    await request('/api/auth/logout', { method: 'POST' })
    user.value = null
    await navigateTo('/login')
  }

  return { user, fetchSession, login, register, logout }
}
