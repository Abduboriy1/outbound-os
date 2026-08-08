/**
 * A tiny harness for exercising `server/api/**` handlers in vitest.
 *
 * The routes are plain h3 event handlers, so h3's own `mockEvent` is enough to
 * drive them — no Nitro, no HTTP listener. What the tests then assert is the
 * §4.3 contract: the status code, and a body that is either `{ data }` or
 * `{ error }`.
 *
 * This file lives under `server/tests/` rather than beside the routes because
 * every file under `server/api/**` becomes an endpoint; a `*.test.ts` there
 * would be served at its own URL.
 */
import { getResponseStatus, mockEvent } from "h3";
import type { EventHandler } from "h3";

export type CallOptions = {
  method?: string;
  query?: Record<string, string | number | undefined>;
  params?: Record<string, string>;
  /** Serialised as JSON. Pass `rawBody` instead to send something malformed. */
  body?: unknown;
  rawBody?: string;
};

export type CallResult<T = unknown> = {
  status: number;
  body: T;
  /** `{ data }` on success — asserted by every happy-path test. */
  data: unknown;
  /** `{ error }` on failure. */
  error: string | undefined;
  details: unknown;
};

export async function call<T = unknown>(
  handler: EventHandler,
  options: CallOptions = {},
): Promise<CallResult<T>> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) search.set(key, String(value));
  }
  const url = `/api/test${search.size ? `?${search}` : ""}`;

  const body =
    options.rawBody ??
    (options.body === undefined ? undefined : JSON.stringify(options.body));

  const event = mockEvent(url, {
    method: options.method ?? (body === undefined ? "GET" : "POST"),
    ...(body === undefined ? {} : { body }),
  });
  event.context.params = options.params ?? {};

  const result = (await handler(event)) as Record<string, unknown>;
  return {
    status: getResponseStatus(event),
    body: result as T,
    data: result?.data,
    error: result?.error as string | undefined,
    details: result?.details,
  };
}

/** A stand-in for the session `route()` resolves. */
export const TEST_USER = {
  id: "user-1",
  email: "demo@example.com",
  name: "Demo User",
};
