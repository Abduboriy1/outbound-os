/**
 * Background jobs (plan §34).
 *
 * Web requests enqueue and return; long research never runs inside a request.
 *
 * The critical property is the fallback: if Redis is unreachable, `enqueue`
 * runs the job inline (awaited) and logs that it did. The product must work
 * with Postgres alone — a missing queue should degrade latency, not break
 * research. Redis availability is probed once and re-probed on a cooldown, so a
 * dead Redis costs one failed connection per interval rather than one per call.
 */

import { Queue, Worker, type Job, type JobsOptions } from "bullmq";
import IORedis, { type Redis } from "ioredis";
import { env } from "./env";
import { runResearch } from "./research/pipeline";
import { detectStaleLeads } from "./research/stale";
import { scoreLeadById } from "./scoring/persist";

export const QUEUE_PREFIX = "ase";

export type JobPayloads = {
  research: { leadId: string; userId: string; reportId?: string };
  "research-refresh": { leadId: string; userId: string };
  scoring: { leadId: string; userId: string };
  "stale-leads": { userId: string };
};

export type JobName = keyof JobPayloads;

export const JOB_NAMES: JobName[] = ["research", "research-refresh", "scoring", "stale-leads"];

export type EnqueueResult = {
  /** "queued" means a worker will run it; "inline" means it already ran. */
  mode: "queued" | "inline";
  jobId?: string;
  result?: unknown;
  error?: string;
};

/* ------------------------------------------------------------ connection */

const REPROBE_AFTER_MS = 30_000;

let connection: Redis | null = null;
let connectionPromise: Promise<Redis | null> | null = null;
let unavailableUntil = 0;

function createConnection() {
  return new IORedis(env().REDIS_URL, {
    // Required by BullMQ, and it stops a dead Redis from retrying forever.
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    lazyConnect: true,
    connectTimeout: 2_000,
    retryStrategy: (attempts) => (attempts > 3 ? null : Math.min(attempts * 200, 1_000)),
  });
}

/** Returns a live connection, or null when Redis is unreachable. */
export async function getRedis(): Promise<Redis | null> {
  if (connection?.status === "ready") return connection;
  if (Date.now() < unavailableUntil) return null;
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    const client = createConnection();
    // A dead connection emits 'error' asynchronously; without a listener that
    // becomes an unhandled exception and takes the process down.
    client.on("error", () => {});
    try {
      await client.connect();
      connection = client;
      unavailableUntil = 0;
      return client;
    } catch (error) {
      unavailableUntil = Date.now() + REPROBE_AFTER_MS;
      console.warn(
        `[queue] Redis unavailable (${messageOf(error)}); jobs will run inline until it returns.`,
      );
      client.disconnect();
      connection = null;
      return null;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

const queues = new Map<JobName, Queue>();

async function getQueue(name: JobName): Promise<Queue | null> {
  const existing = queues.get(name);
  if (existing) return existing;
  const redis = await getRedis();
  if (!redis) return null;
  const queue = new Queue(name, { connection: redis, prefix: QUEUE_PREFIX });
  queue.on("error", (error) => console.warn(`[queue:${name}]`, messageOf(error)));
  queues.set(name, queue);
  return queue;
}

/* --------------------------------------------------------------- enqueue */

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 200 },
};

export async function enqueue<K extends JobName>(
  name: K,
  payload: JobPayloads[K],
  options?: JobsOptions,
): Promise<EnqueueResult> {
  const queue = await getQueue(name);

  if (queue) {
    try {
      const job = await queue.add(name, payload, { ...DEFAULT_JOB_OPTIONS, ...options });
      return { mode: "queued", jobId: job.id };
    } catch (error) {
      console.warn(`[queue] enqueue failed for ${name}, running inline:`, messageOf(error));
    }
  }

  // Inline fallback. Awaited on purpose: the caller has to know it completed,
  // and there is no worker to pick it up.
  console.info(`[queue] running ${name} inline (no Redis)`);
  try {
    const result = await runJob(name, payload);
    return { mode: "inline", result };
  } catch (error) {
    console.error(`[queue] inline ${name} failed:`, messageOf(error));
    return { mode: "inline", error: messageOf(error) };
  }
}

/* -------------------------------------------------------------- processor */

/** The job bodies. Shared by the worker and the inline fallback. */
export async function runJob<K extends JobName>(
  name: K,
  payload: JobPayloads[K],
): Promise<unknown> {
  switch (name) {
    case "research": {
      const data = payload as JobPayloads["research"];
      return runResearch({
        leadId: data.leadId,
        userId: data.userId,
        reportId: data.reportId,
        actorType: "SYSTEM",
      });
    }
    case "research-refresh": {
      const data = payload as JobPayloads["research-refresh"];
      // A refresh writes a new report so the previous one stays readable.
      return runResearch({ leadId: data.leadId, userId: data.userId, actorType: "SYSTEM" });
    }
    case "scoring": {
      const data = payload as JobPayloads["scoring"];
      return scoreLeadById({ leadId: data.leadId, userId: data.userId, actorType: "SYSTEM" });
    }
    case "stale-leads": {
      const data = payload as JobPayloads["stale-leads"];
      return detectStaleLeads({ userId: data.userId });
    }
    default: {
      throw new Error(`Unknown job ${String(name)}`);
    }
  }
}

/* ---------------------------------------------------------------- workers */

export type WorkerHandle = { workers: Worker[]; close: () => Promise<void> };

/**
 * Starts one worker per queue. Returns null when Redis is unavailable, which is
 * the signal for `src/worker/index.ts` to exit with an explanation rather than
 * sit in a reconnect loop.
 */
export async function createWorkers(concurrency = 2): Promise<WorkerHandle | null> {
  const redis = await getRedis();
  if (!redis) return null;

  // The probe connection above fails fast on purpose (2s timeout, gives up
  // after 3 retries) so the web app can fall back to inline jobs. BullMQ
  // duplicates whatever connection a Worker is given, and a duplicate that
  // inherits those settings dies for good the first time a connect is slow
  // (e.g. while the dev server is building). Workers are long-lived, so they
  // get their own connection that waits longer and never stops retrying.
  const workerConnection = new IORedis(env().REDIS_URL, {
    maxRetriesPerRequest: null,
    connectTimeout: 10_000,
    retryStrategy: (attempts) => Math.min(attempts * 500, 5_000),
  });
  workerConnection.on("error", (error) =>
    console.warn(`[worker] Redis connection error (will retry): ${messageOf(error)}`),
  );

  const workers = JOB_NAMES.map((name) => {
    const worker = new Worker(
      name,
      async (job: Job) => runJob(name, job.data as JobPayloads[JobName]),
      { connection: workerConnection, prefix: QUEUE_PREFIX, concurrency },
    );
    worker.on("failed", (job, error) =>
      console.error(`[worker:${name}] job ${job?.id} failed:`, messageOf(error)),
    );
    worker.on("completed", (job) => console.info(`[worker:${name}] job ${job.id} done`));
    return worker;
  });

  return {
    workers,
    close: async () => {
      await Promise.all(workers.map((worker) => worker.close()));
      await workerConnection.quit().catch(() => {});
    },
  };
}

/** Queue depth for the research queue UI. Empty when Redis is not in use. */
export async function queueStatus(): Promise<{
  redis: boolean;
  counts: Partial<Record<JobName, { waiting: number; active: number; failed: number }>>;
}> {
  const redis = await getRedis();
  if (!redis) return { redis: false, counts: {} };

  const counts: Partial<Record<JobName, { waiting: number; active: number; failed: number }>> = {};
  for (const name of JOB_NAMES) {
    const queue = await getQueue(name);
    if (!queue) continue;
    try {
      const [waiting, active, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getFailedCount(),
      ]);
      counts[name] = { waiting, active, failed };
    } catch {
      // A count failure is not worth failing the page over.
    }
  }
  return { redis: true, counts };
}

export async function closeQueues() {
  await Promise.all([...queues.values()].map((queue) => queue.close()));
  queues.clear();
  await connection?.quit().catch(() => {});
  connection = null;
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
