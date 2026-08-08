import { ok, route } from "~~/server/lib/api";
import { queueStatus } from "~~/server/lib/queue";

/**
 * BullMQ health for the research queue's Workers card.
 *
 * `src/app/(app)/research/queue/page.tsx` called `queueStatus()` directly as a
 * server component; there is no Nuxt equivalent (MIGRATION.md §2.5), so it
 * becomes an endpoint. The body is `queueStatus()`'s return value unchanged —
 * `{ redis, counts }`, where `counts` is empty when Redis is unreachable and
 * jobs are running inline — wrapped in the §4.3 `{ data }` envelope.
 *
 * `queueStatus()` never throws: a per-queue count failure is swallowed inside
 * it, and an unreachable Redis is reported as `redis: false` rather than an
 * error, because the page treats "inline" as a working state and not a fault.
 */
export default route(async () => ok(await queueStatus()));
