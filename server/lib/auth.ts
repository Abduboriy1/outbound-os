import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { deleteCookie, getCookie, setCookie, type H3Event } from "h3";
import { prisma } from "./db";
import { env } from "./env";

/**
 * Ported from the Next app's `src/lib/auth.ts`.
 *
 * Everything about the session is unchanged — same cookie name, same HS256
 * signature over `{ sub: userId }`, same 14-day expiry, same cookie flags — so
 * a token minted by the Next app is still valid here and vice versa. The only
 * difference is plumbing: Next's ambient `cookies()` becomes an explicit
 * `H3Event`, and React's per-request `cache()` becomes a memo on
 * `event.context`.
 */

/** Exported so the server middleware can gate on cookie presence. */
export const SESSION_COOKIE = "ase_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  tone: string;
  timezone: string;
};

function secret() {
  return new TextEncoder().encode(env().AUTH_SECRET);
}

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function createSession(event: H3Event, userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function destroySession(event: H3Event) {
  deleteCookie(event, SESSION_COOKIE, { path: "/" });
  // A stale memo would otherwise keep the just-signed-out user alive for the
  // remainder of this request.
  delete event.context.sessionUser;
}

/**
 * Resolves the signed-in user. Memoised on the request context so a handler
 * that asks twice still issues one query — the h3 equivalent of React `cache`.
 */
export async function getCurrentUser(event: H3Event): Promise<SessionUser | null> {
  if (event.context.sessionUser !== undefined) {
    return event.context.sessionUser as SessionUser | null;
  }

  const resolved = await resolveUser(event);
  event.context.sessionUser = resolved;
  return resolved;
}

async function resolveUser(event: H3Event): Promise<SessionUser | null> {
  const token = getCookie(event, SESSION_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const userId = payload.sub;
    if (typeof userId !== "string") return null;
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tone: true,
        timezone: true,
      },
    });
    return user;
  } catch {
    return null;
  }
}

/** Throws when unauthenticated — use inside route handlers. */
export async function requireUser(event: H3Event): Promise<SessionUser> {
  const user = await getCurrentUser(event);
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "UnauthorizedError";
  }
}

declare module "h3" {
  interface H3EventContext {
    /** Memoised result of `getCurrentUser` for this request. */
    sessionUser?: SessionUser | null;
  }
}
