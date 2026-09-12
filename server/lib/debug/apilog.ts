/**
 * Debug logging for outbound third-party requests (plan: observability).
 *
 * Every call to an AI provider, search vendor, or crawled page can record one
 * `debug_logs` row per attempt. Two properties matter more than completeness:
 *   - Logging must never break the caller. Writes are fire-and-forget and any
 *     failure (no DB in a unit test, migration not applied yet) is swallowed
 *     after one console warning per process.
 *   - The table must not grow forever. Each write opportunistically prunes
 *     rows older than the retention window, at most once per hour.
 *
 * `meta` is for small sanitised details — model name, query, token counts.
 * API keys and full page bodies never belong in it.
 */

import { env } from "~~/server/lib/env";

export type ApiCallLog = {
  provider: string;
  operation: string;
  url?: string;
  status?: number | null;
  ok: boolean;
  durationMs: number;
  attempt?: number;
  error?: string;
  meta?: Record<string, unknown>;
};

const RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const PRUNE_EVERY_MS = 60 * 60 * 1_000;

let lastPruneAt = 0;
let warnedOnce = false;

/** Fire-and-forget: returns immediately, never throws. */
export function logApiCall(entry: ApiCallLog): void {
  if (env().DEBUG_API_LOGS !== "on") return;

  void (async () => {
    // Imported lazily so unit tests that touch a provider module don't pay for
    // (or depend on) Prisma client construction at import time.
    const { prisma } = await import("~~/server/lib/db");

    await prisma.debugLog.create({
      data: {
        provider: entry.provider,
        operation: entry.operation,
        url: entry.url?.slice(0, 2_000),
        status: entry.status ?? null,
        ok: entry.ok,
        durationMs: Math.round(entry.durationMs),
        attempt: entry.attempt ?? 1,
        error: entry.error?.slice(0, 4_000),
        meta: entry.meta as never,
      },
    });

    const now = Date.now();
    if (now - lastPruneAt > PRUNE_EVERY_MS) {
      lastPruneAt = now;
      await prisma.debugLog.deleteMany({
        where: { createdAt: { lt: new Date(now - RETENTION_MS) } },
      });
    }
  })().catch((error) => {
    if (!warnedOnce) {
      warnedOnce = true;
      console.warn(
        "[debug] api call logging unavailable:",
        error instanceof Error ? error.message : String(error),
      );
    }
  });
}
