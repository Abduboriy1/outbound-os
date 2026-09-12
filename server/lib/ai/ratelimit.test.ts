import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "./ratelimit";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("admits up to the window size immediately", async () => {
    const limiter = new RateLimiter(3, 60_000);
    const admitted: number[] = [];

    for (let i = 0; i < 3; i += 1) {
      void limiter.acquire().then(() => admitted.push(i));
    }
    await vi.advanceTimersByTimeAsync(0);

    expect(admitted).toEqual([0, 1, 2]);
  });

  it("parks the overflow until the oldest request ages out", async () => {
    const limiter = new RateLimiter(2, 60_000);
    const admitted: number[] = [];

    for (let i = 0; i < 4; i += 1) {
      void limiter.acquire().then(() => admitted.push(i));
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(admitted).toEqual([0, 1]);

    // Half a window: still full.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(admitted).toEqual([0, 1]);

    // First two age out together (same tick), so both waiters drain in order.
    await vi.advanceTimersByTimeAsync(31_000);
    expect(admitted).toEqual([0, 1, 2, 3]);
  });

  it("penalize holds every queued request back", async () => {
    const limiter = new RateLimiter(5, 60_000);
    limiter.penalize(10_000);

    const admitted: number[] = [];
    void limiter.acquire().then(() => admitted.push(0));

    await vi.advanceTimersByTimeAsync(5_000);
    expect(admitted).toEqual([]);

    await vi.advanceTimersByTimeAsync(5_100);
    expect(admitted).toEqual([0]);
  });

  it("keeps FIFO order under contention", async () => {
    const limiter = new RateLimiter(1, 1_000);
    const admitted: number[] = [];

    for (let i = 0; i < 3; i += 1) {
      void limiter.acquire().then(() => admitted.push(i));
    }
    await vi.advanceTimersByTimeAsync(3_500);

    expect(admitted).toEqual([0, 1, 2]);
  });
});
