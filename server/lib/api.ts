import {
  defineEventHandler,
  getQuery,
  getRouterParams,
  readRawBody,
  setResponseHeader,
  setResponseStatus,
  type EventHandler,
  type H3Event,
} from "h3";
import { ZodError, type ZodType } from "zod";
import { UnauthorizedError, requireUser, type SessionUser } from "./auth";
import { AiRunError } from "./ai/service";

/**
 * Ported from the Next app's `src/lib/api.ts`.
 *
 * The wire contract is byte-identical to the Next version: every endpoint
 * answers `{ data }` on success and `{ error, details? }` on failure, with the
 * same status codes. Only the transport changed — `NextResponse` became an
 * `ApiResponse` marker that `route()` unwraps onto the h3 event, because h3's
 * `createError` would emit `{ statusCode, statusMessage, ... }` and break the
 * shape every page depends on.
 */

/**
 * What a handler returns. `route()` applies `status`/`headers` to the event and
 * returns `body` as-is, so `JSON.stringify(body)` matches the Next response.
 */
export class ApiResponse<T = unknown> {
  constructor(
    readonly body: T,
    readonly status: number = 200,
    readonly headers: Record<string, string> = {},
  ) {}
}

export type Handler = (
  event: H3Event,
  ctx: { user: SessionUser; params: Record<string, string> },
) => Promise<ApiResponse | Response> | ApiResponse | Response;

export function ok<T>(data: T, init?: { status?: number; headers?: Record<string, string> }) {
  return new ApiResponse({ data }, init?.status ?? 200, init?.headers ?? {});
}

export function fail(message: string, status = 400, extra?: unknown) {
  return new ApiResponse({ error: message, details: extra }, status);
}

/**
 * Wraps a route handler with authentication and uniform error shaping so every
 * endpoint returns `{data}` or `{error}` and never leaks a stack trace.
 */
export function route(handler: Handler): EventHandler {
  return defineEventHandler(async (event) => {
    try {
      const user = await requireUser(event);
      const params = getRouterParams(event) as Record<string, string>;
      return send(event, await handler(event, { user, params }));
    } catch (error) {
      return send(event, toErrorResponse(error));
    }
  });
}

/**
 * Same as `route()` but without the session check — for the endpoints that
 * authenticate some other way. Only `/api/intake` (bearer token) uses it.
 */
export function publicRoute(
  handler: (event: H3Event) => Promise<ApiResponse | Response> | ApiResponse | Response,
): EventHandler {
  return defineEventHandler(async (event) => {
    try {
      return send(event, await handler(event));
    } catch (error) {
      return send(event, toErrorResponse(error));
    }
  });
}

function send(event: H3Event, result: ApiResponse | Response) {
  if (result instanceof ApiResponse) {
    setResponseStatus(event, result.status);
    for (const [key, value] of Object.entries(result.headers)) {
      setResponseHeader(event, key, value);
    }
    return result.body;
  }
  return result;
}

export function toErrorResponse(error: unknown): ApiResponse {
  if (error instanceof UnauthorizedError) return fail("Not authenticated", 401);
  if (error instanceof ZodError)
    return fail("Validation failed", 422, error.issues);
  if (error instanceof HttpError) return fail(error.message, error.status);
  // A failed model call is an upstream fault the operator can act on (retry,
  // switch provider), so the message survives instead of a blank 500. The
  // AIService has already stripped it down to a one-line description.
  if (error instanceof AiRunError) return fail(error.message, 502);
  console.error("[api]", error);
  return fail("Internal server error", 500);
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function notFound(what = "Resource"): never {
  throw new HttpError(`${what} not found`, 404);
}

/** Parses and validates a JSON request body. Throws ZodError on mismatch. */
export async function parseBody<T>(event: H3Event, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    const text = await readRawBody(event, "utf8");
    // `Request.json()` rejects an empty body; match that so callers relying on
    // `.catch()` (see /api/email/ingest) behave the same as under Next.
    if (text == null || text.trim() === "") throw new SyntaxError("empty body");
    raw = JSON.parse(text);
  } catch {
    throw new HttpError("Request body must be valid JSON", 400);
  }
  return schema.parse(raw);
}

/**
 * Parses and validates the query string. h3's `getQuery` yields an array when a
 * key repeats; the Next version used `Object.fromEntries(searchParams)`, which
 * keeps the last occurrence — so flatten the same way.
 */
export function parseQuery<T>(event: H3Event, schema: ZodType<T>): T {
  const query = getQuery(event);
  const flat: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    flat[key] = Array.isArray(value) ? value[value.length - 1] : value;
  }
  return schema.parse(flat);
}

export { requireUser };
export type { SessionUser };
