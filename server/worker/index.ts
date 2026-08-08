/**
 * Background worker entry point (`npm run worker`).
 *
 * Runs the BullMQ workers for research, refresh, scoring, and stale-lead
 * detection. If Redis is not running it exits immediately with an explanation
 * rather than looping — the app still works without it, because `enqueue` falls
 * back to running jobs inline.
 */

import "dotenv/config";
import { createWorkers, closeQueues, JOB_NAMES } from "~~/server/lib/queue";

async function main() {
  const handle = await createWorkers();

  if (!handle) {
    console.error(
      [
        "[worker] Redis is not reachable, so there is nothing to listen to.",
        "Start it with `npm run db:up`, or leave it off — the app runs jobs",
        "inline when the queue is unavailable.",
      ].join(" "),
    );
    process.exitCode = 1;
    return;
  }

  console.info(`[worker] listening on: ${JOB_NAMES.join(", ")}`);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[worker] ${signal} received, finishing in-flight jobs...`);
    await handle.close();
    await closeQueues();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[worker] failed to start", error);
  process.exit(1);
});
