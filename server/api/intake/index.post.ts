import { defineEventHandler, getRequestHeaders, getRequestURL, readRawBody } from "h3";
import { handleIntake } from "~~/server/lib/intake/handler";

/**
 * Public website intake (plan §56, §57) — the only endpoint reachable without a
 * session. All of the behaviour lives in `server/lib/intake/handler.ts`, which
 * speaks plain `Request`/`Response`; this file is only the Nitro binding.
 *
 * The request is rebuilt rather than passed through as `event.req`: under
 * Nitro's Node preset `event.req` is a lazy proxy whose `headers` is a plain
 * object, not a `Headers` instance, and the handler reads
 * `headers.get("authorization")` and `headers.get("x-forwarded-for")`.
 */
export default defineEventHandler(async (event) => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(getRequestHeaders(event))) {
    if (value != null) headers.set(name, value);
  }

  const body = await readRawBody(event, "utf8");

  return handleIntake(
    new Request(getRequestURL(event), { method: "POST", headers, body }),
  );
});
