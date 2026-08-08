import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_USER, call } from "../harness";

/**
 * `/api/queue` is the endpoint form of the `queueStatus()` call that
 * `src/app/(app)/research/queue/page.tsx` made as a server component. There is
 * nothing to port beyond the envelope, so what is worth pinning is that the
 * §4.3 shape is right, that the "Redis is down" answer reaches the page as a
 * 200 rather than an error (the Workers card treats it as the inline mode, not
 * a fault), and that it is authenticated like every other route.
 */
const queueStatus = vi.fn(async () => ({ redis: false, counts: {} }) as unknown);

class UnauthorizedError extends Error {}
let session: typeof TEST_USER | null = TEST_USER;

vi.mock("~~/server/lib/queue", () => ({ queueStatus }));
vi.mock("~~/server/lib/auth", () => ({
  UnauthorizedError,
  requireUser: async () => {
    if (!session) throw new UnauthorizedError();
    return session;
  },
}));

const queueGet = (await import("../../api/queue/index.get")).default;

beforeEach(() => {
  session = TEST_USER;
  vi.clearAllMocks();
  queueStatus.mockResolvedValue({ redis: false, counts: {} });
});

describe("GET /api/queue", () => {
  it("returns queueStatus() in the §4.3 envelope", async () => {
    queueStatus.mockResolvedValue({
      redis: true,
      counts: {
        research: { waiting: 2, active: 1, failed: 0 },
        scoring: { waiting: 0, active: 0, failed: 3 },
      },
    });

    const res = await call(queueGet);

    expect(res.status).toBe(200);
    expect(res.data).toEqual({
      redis: true,
      counts: {
        research: { waiting: 2, active: 1, failed: 0 },
        scoring: { waiting: 0, active: 0, failed: 3 },
      },
    });
  });

  it("reports an unreachable Redis as a 200 with no counts, not an error", async () => {
    const res = await call(queueGet);

    expect(res.status).toBe(200);
    expect(res.error).toBeUndefined();
    // What the Workers card renders as "inline".
    expect(res.data).toEqual({ redis: false, counts: {} });
  });

  it("401s when there is no session", async () => {
    session = null;

    const res = await call(queueGet);

    expect(res.status).toBe(401);
    expect(res.error).toBe("Not authenticated");
    expect(queueStatus).not.toHaveBeenCalled();
  });
});
