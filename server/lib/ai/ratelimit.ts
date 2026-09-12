/**
 * In-process request rate limiter for third-party APIs.
 *
 * Gemini's free tier enforces a small requests-per-minute quota, and a research
 * run fires several model calls back to back — so without pacing, bursts turn
 * into 429s. `RateLimiter` is a sliding-window queue: `acquire()` resolves
 * immediately while the window has room, and otherwise parks the caller in FIFO
 * order until the oldest request ages out of the window. One caller never
 * overtakes another, so a long research run drains steadily instead of
 * thundering.
 *
 * `penalize(ms)` handles the case where the service says 429 anyway (shared
 * key, another process, quota smaller than configured): it pushes the whole
 * queue's next-allowed time forward so every waiting request holds off, not
 * just the one that got the error.
 *
 * The limiter is per-process. If the web app and a queue worker both make
 * Gemini calls, each gets its own window — set GEMINI_RPM to a share of the
 * real quota in that setup.
 */

import { env } from "~~/server/lib/env";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class RateLimiter {
  private sentAt: number[] = [];
  private notBefore = 0;
  /** FIFO chain — each acquire waits for the previous one to be admitted. */
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs = 60_000,
  ) {}

  /** Resolves when the caller may send. Queued FIFO; never rejects. */
  acquire(): Promise<void> {
    const turn = this.tail.then(() => this.admit());
    // The chain itself must survive an (impossible today) rejection.
    this.tail = turn.catch(() => {});
    return turn;
  }

  /** Hold every queued request until now + ms (e.g. server-sent retryDelay). */
  penalize(ms: number): void {
    this.notBefore = Math.max(this.notBefore, Date.now() + ms);
  }

  /** How many requests were admitted within the current window. */
  get inFlight(): number {
    const cutoff = Date.now() - this.windowMs;
    return this.sentAt.filter((t) => t > cutoff).length;
  }

  private async admit(): Promise<void> {
    for (;;) {
      const now = Date.now();
      if (now < this.notBefore) {
        await sleep(this.notBefore - now);
        continue;
      }
      this.sentAt = this.sentAt.filter((t) => t > now - this.windowMs);
      if (this.sentAt.length < this.maxPerWindow) {
        this.sentAt.push(now);
        return;
      }
      await sleep(this.sentAt[0]! + this.windowMs - now + 25);
    }
  }
}

/** No-op stand-in for tests and providers that don't need pacing. */
export const unlimited: Pick<RateLimiter, "acquire" | "penalize"> = {
  acquire: () => Promise.resolve(),
  penalize: () => {},
};

let geminiLimiter: RateLimiter | null = null;

/** Shared limiter for all Gemini calls in this process. */
export function getGeminiLimiter(): RateLimiter {
  if (!geminiLimiter) geminiLimiter = new RateLimiter(env().GEMINI_RPM, 60_000);
  return geminiLimiter;
}
