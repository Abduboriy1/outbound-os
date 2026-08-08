import { defineEventHandler, setResponseStatus } from "h3";

/**
 * Catch-all for `/api/**`.
 *
 * Without it an unmatched API path falls through to the Vue renderer, which
 * then bounces the caller to /login — confusing for an API client, and unlike
 * Next, where an unmatched route handler simply 404s. Nitro matches this only
 * after every concrete route, so it never shadows a real endpoint.
 *
 * The body uses the same `{ error }` shape as every other endpoint.
 */
/**
 * The `: unknown` return annotation is load-bearing, not decoration.
 *
 * Nitro maps this file to the route pattern `/api/**`, so its return type
 * becomes the inferred response type of **every** `/api/…` path that has no
 * concrete handler. Returning the object un-annotated typed all of those as
 * `{ error: string }`, and a page fetching an endpoint that had not been
 * written yet got `TS2352: Conversion of type '{ error: string }' to type
 * '{ data: Foo[] }' may be a mistake` instead of a clean unknown.
 *
 * `unknown` casts to anything, so `res as { data: Foo[] }` compiles, and the
 * moment the real route file exists Nitro infers its actual type instead.
 */
export default defineEventHandler((event): unknown => {
  setResponseStatus(event, 404);
  return { error: "Resource not found" };
});
