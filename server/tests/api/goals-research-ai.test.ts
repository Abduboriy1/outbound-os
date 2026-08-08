import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_USER, call } from "../harness";

/**
 * The remaining gaps: the two goals lists the goals page read straight off
 * Prisma, the `weeklyReview` branch that `/api/ai` was missing, the two fields
 * the research list owed `/research/queue` and `/research/signals`, and the
 * company industries the filter had been deriving from a second request.
 */

const goalFindMany = vi.fn(async () => [{ id: "goal-1" }]);
const goalProgressFindMany = vi.fn(async () => [{ id: "gp-1" }]);
const researchFindMany = vi.fn(async () => [] as unknown[]);

const prismaMock = {
  goal: { findMany: goalFindMany },
  goalProgress: { findMany: goalProgressFindMany },
  researchReport: { findMany: researchFindMany },
};

const generateWeeklyReview = vi.fn(async () => ({
  data: { what_worked: [] },
  runId: "run-1",
  model: "mock",
  generatedAt: new Date("2026-08-07T00:00:00.000Z"),
}) as unknown);
const runSalesCoach = vi.fn(async () => ({ runId: "run-2" }));
const runAgentForLead = vi.fn(async () => ({ runId: "run-3" }));
const enqueue = vi.fn(async () => ({ mode: "queued" as const }));
const companyIndustries = vi.fn(async () => ["Logistics", "Trucking"]);

class AgentInputError extends Error {}
class UnauthorizedError extends Error {}
let session: typeof TEST_USER | null = TEST_USER;

vi.mock("~~/server/lib/db", () => ({ prisma: prismaMock }));
vi.mock("~~/server/lib/auth", () => ({
  UnauthorizedError,
  requireUser: async () => {
    if (!session) throw new UnauthorizedError();
    return session;
  },
}));
vi.mock("~~/server/lib/analytics/coach", () => ({ generateWeeklyReview }));
vi.mock("~~/server/lib/queue", () => ({ enqueue }));
vi.mock("~~/server/lib/ai/leadAgents", () => ({
  AgentInputError,
  LEAD_AGENTS: ["qualification", "opportunity"],
  isLeadAgent: (agent: string) => ["qualification", "opportunity"].includes(agent),
  runAgentForLead,
  runSalesCoach,
}));
vi.mock("~~/server/lib/leads/queries", () => ({ companyIndustries }));

const archivedGet = (await import("../../api/goals/archived/index.get")).default;
const historyGet = (await import("../../api/goals/history/index.get")).default;
const aiPost = (await import("../../api/ai/index.post")).default;
const researchGet = (await import("../../api/research/index.get")).default;
const industriesGet = (await import("../../api/companies/industries/index.get")).default;

beforeEach(() => {
  session = TEST_USER;
  vi.clearAllMocks();
});

describe("GET /api/goals/archived", () => {
  it("returns the inactive goals, newest change first", async () => {
    const res = await call(archivedGet);

    expect(res.status).toBe(200);
    expect(res.data).toEqual([{ id: "goal-1" }]);
    expect(goalFindMany).toHaveBeenCalledWith({
      where: { userId: TEST_USER.id, isActive: false },
      orderBy: { updatedAt: "desc" },
      select: { id: true, metric: true, period: true, target: true },
    });
  });
});

describe("GET /api/goals/history", () => {
  it("returns 24 snapshots, newest window first, with the goal they belong to", async () => {
    const res = await call(historyGet);

    expect(res.data).toEqual([{ id: "gp-1" }]);
    expect(goalProgressFindMany).toHaveBeenCalledWith({
      where: { goal: { userId: TEST_USER.id } },
      orderBy: { periodStart: "desc" },
      take: 24,
      select: {
        id: true,
        periodStart: true,
        periodEnd: true,
        value: true,
        goal: { select: { metric: true, period: true, target: true } },
      },
    });
  });
});

describe("POST /api/ai — the weeklyReview branch", () => {
  it("runs the weekly review and returns the run", async () => {
    const res = await call(aiPost, { body: { agent: "weeklyReview" } });

    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ runId: "run-1", model: "mock" });
    expect(generateWeeklyReview).toHaveBeenCalledWith(TEST_USER.id);
  });

  it("says so when the model call fails, instead of the source's silent no-op", async () => {
    generateWeeklyReview.mockResolvedValueOnce(null);
    const res = await call(aiPost, { body: { agent: "weeklyReview" } });

    expect(res.status).toBe(502);
    expect(res.error).toBe("The weekly review could not be generated");
  });

  it("leaves the other branches alone", async () => {
    const coach = await call(aiPost, { body: { agent: "salesCoach" } });
    expect(coach.status).toBe(200);
    expect(runSalesCoach).toHaveBeenCalledWith(TEST_USER.id);

    const research = await call(aiPost, {
      body: { agent: "research", leadId: "lead-1" },
    });
    expect(research.status).toBe(202);
    expect(enqueue).toHaveBeenCalledWith("research", {
      leadId: "lead-1",
      userId: TEST_USER.id,
    });

    const lead = await call(aiPost, {
      body: { agent: "qualification", leadId: "lead-1" },
    });
    expect(lead.status).toBe(200);
    expect(runAgentForLead).toHaveBeenCalled();
  });

  it("lists weeklyReview among the supported agents when one is unknown", async () => {
    const res = await call(aiPost, { body: { agent: "astrology" } });

    expect(res.status).toBe(400);
    expect(res.error).toContain("weeklyReview");
    expect(res.error).toContain('Unsupported agent "astrology"');
  });
});

describe("GET /api/research", () => {
  const report = {
    id: "r-1",
    leadId: "lead-1",
    status: "COMPLETE",
    _count: { claims: 3, sources: 4 },
    payload: {
      version: 1,
      signals: [
        {
          type: "HIRING_SURGE",
          label: "Hiring surge",
          family: "HIRING",
          keyword: "hiring",
          evidence: "Six operations roles open",
          sourceLabel: "Careers page",
          weight: 3,
          origin: "RULE",
        },
      ],
      opportunities: [{ title: "A" }, { title: "B" }],
      warnings: [],
    },
  };

  it("adds the opportunities count the queue's progress row needs", async () => {
    researchFindMany.mockResolvedValueOnce([report]);
    const res = await call(researchGet);

    expect(res.status).toBe(200);
    expect(res.data).toMatchObject([{ signals: 1, opportunities: 2 }]);
  });

  it("keeps `signals` a count, so existing callers are unaffected", async () => {
    researchFindMany.mockResolvedValueOnce([report]);
    const res = await call(researchGet);

    const [row] = res.data as [Record<string, unknown>];
    expect(row.signals).toBe(1);
    expect(row.signalDetails).toBeUndefined();
    expect(row.payload).toBeUndefined();
  });

  it("adds signalDetails only when asked, which collapses the signals page's N+1", async () => {
    researchFindMany.mockResolvedValueOnce([report]);
    const res = await call(researchGet, { query: { include: "signals" } });

    const [row] = res.data as [{ signals: number; signalDetails: unknown[] }];
    expect(row.signals).toBe(1);
    expect(row.signalDetails).toEqual(report.payload.signals);
  });

  it("still filters and caps the way it did", async () => {
    await call(researchGet, { query: { status: "COMPLETE", leadId: "lead-1", limit: 100 } });

    expect(researchFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          lead: { userId: TEST_USER.id, deletedAt: null },
          leadId: "lead-1",
          status: "COMPLETE",
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    );
  });
});

describe("GET /api/companies/industries", () => {
  it("returns the distinct industries", async () => {
    const res = await call(industriesGet);

    expect(res.status).toBe(200);
    expect(res.data).toEqual(["Logistics", "Trucking"]);
    expect(companyIndustries).toHaveBeenCalledWith(TEST_USER.id);
  });
});
