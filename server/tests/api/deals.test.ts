import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_USER, call } from "../harness";

/**
 * `/api/meetings`, `/api/proposals` and `/api/opportunities` are ports of
 * Prisma queries that lived inside Next server components, so what matters is
 * that the query the endpoint issues is the source's — the ordering, the take
 * and the include are the parts a page silently depends on. Prisma is replaced
 * with a recorder and those arguments are asserted directly.
 */

/** `args` is typed so the assertions below can read `mock.calls[0][0]`. */
type Args = Record<string, unknown>;

const findMany = {
  meeting: vi.fn(async (_args: Args) => [] as unknown[]),
  proposal: vi.fn(async (_args: Args) => [] as unknown[]),
  opportunity: vi.fn(async (_args: Args) => [] as unknown[]),
};
const opportunityFindFirst = vi.fn(async (_args: Args) => null as unknown);
const opportunityUpdate = vi.fn(async (args: unknown) => args);
const roiUpsert = vi.fn(async (_args: Args) => ({}));
const activityCreate = vi.fn(async () => ({}));

const prismaMock = {
  meeting: { findMany: findMany.meeting },
  proposal: { findMany: findMany.proposal },
  opportunity: {
    findMany: findMany.opportunity,
    findFirst: opportunityFindFirst,
    update: opportunityUpdate,
  },
  roiEstimate: { upsert: roiUpsert },
  activity: { create: activityCreate },
};

const auditMock = vi.fn(async () => {});

class UnauthorizedError extends Error {}
let session: typeof TEST_USER | null = TEST_USER;

vi.mock("~~/server/lib/db", () => ({ prisma: prismaMock }));
vi.mock("~~/server/lib/audit", () => ({ audit: auditMock }));
vi.mock("~~/server/lib/auth", () => ({
  UnauthorizedError,
  requireUser: async () => {
    if (!session) throw new UnauthorizedError();
    return session;
  },
}));

const meetingsGet = (await import("../../api/meetings/index.get")).default;
const proposalsGet = (await import("../../api/proposals/index.get")).default;
const opportunitiesGet = (await import("../../api/opportunities/index.get")).default;
const opportunityGet = (await import("../../api/opportunities/[id]/index.get")).default;
const opportunityPatch = (await import("../../api/opportunities/[id]/index.patch")).default;
const roiPut = (await import("../../api/opportunities/[id]/roi/index.put")).default;

beforeEach(() => {
  session = TEST_USER;
  vi.clearAllMocks();
});

describe("GET /api/meetings", () => {
  it("answers with the §4.3 envelope and both windows by default", async () => {
    findMany.meeting
      .mockResolvedValueOnce([{ id: "m-upcoming" }])
      .mockResolvedValueOnce([{ id: "m-past" }]);

    const res = await call(meetingsGet);

    expect(res.status).toBe(200);
    expect(res.data).toEqual([{ id: "m-upcoming" }, { id: "m-past" }]);
    expect(findMany.meeting).toHaveBeenCalledTimes(2);
  });

  it("issues the source's two queries: 25 ascending from now, 25 descending before it", async () => {
    await call(meetingsGet);

    const upcoming = findMany.meeting.mock.calls[0]![0] as Record<string, never>;
    const past = findMany.meeting.mock.calls[1]![0] as Record<string, never>;

    expect(upcoming).toMatchObject({
      where: { lead: { userId: TEST_USER.id, deletedAt: null } },
      orderBy: { scheduledAt: "asc" },
      take: 25,
    });
    expect(past).toMatchObject({
      orderBy: { scheduledAt: "desc" },
      take: 25,
    });
  });

  it("carries the union of both source includes on every row", async () => {
    await call(meetingsGet);
    const upcoming = findMany.meeting.mock.calls[0]![0] as { include: Record<string, unknown> };

    // `contact` was only on the source's upcoming query and `summaries` only on
    // its past one; the discovery page splits the list itself, so a row has to
    // carry both.
    expect(Object.keys(upcoming.include).sort()).toEqual([
      "company",
      "contact",
      "lead",
      "summaries",
    ]);
    expect(upcoming.include.summaries).toEqual({
      select: { id: true, summary: true },
      take: 1,
      orderBy: { createdAt: "desc" },
    });
  });

  it("narrows to a window, which is what the dashboard's seven-day count needs", async () => {
    const to = "2026-08-14T00:00:00.000Z";
    await call(meetingsGet, { query: { scope: "upcoming", to, take: 200 } });

    expect(findMany.meeting).toHaveBeenCalledTimes(1);
    const args = findMany.meeting.mock.calls[0]![0] as { where: { scheduledAt: { gte: Date; lt: Date } }; take: number };
    expect(args.where.scheduledAt.lt).toEqual(new Date(to));
    expect(args.where.scheduledAt.gte).toBeInstanceOf(Date);
    expect(args.take).toBe(200);
  });

  it("rejects a take beyond the cap", async () => {
    const res = await call(meetingsGet, { query: { take: 5000 } });
    expect(res.status).toBe(422);
    expect(res.error).toBe("Validation failed");
  });

  it("401s without a session", async () => {
    session = null;
    const res = await call(meetingsGet);
    expect(res.status).toBe(401);
    expect(res.error).toBe("Not authenticated");
  });
});

describe("GET /api/proposals", () => {
  it("orders by sentAt then createdAt, takes 100 and includes the newest version", async () => {
    await call(proposalsGet);

    const args = findMany.proposal.mock.calls[0]![0] as Record<string, unknown>;
    expect(args).toMatchObject({
      where: { lead: { userId: TEST_USER.id, deletedAt: null } },
      orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        company: { select: { name: true } },
        lead: { select: { id: true, stage: true, wonAt: true, lostAt: true } },
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          select: { version: true, investmentMin: true, investmentMax: true },
        },
      },
    });
  });
});

describe("GET /api/opportunities", () => {
  it("orders by confidence then createdAt and joins company, lead and roi", async () => {
    await call(opportunitiesGet);

    const args = findMany.opportunity.mock.calls[0]![0] as Record<string, unknown>;
    expect(args).toMatchObject({
      orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        company: { select: { name: true, industry: true } },
        lead: { select: { id: true, stage: true, overallScore: true } },
        roi: { select: { prospectSupplied: true } },
      },
    });
  });
});

describe("GET /api/opportunities/:id", () => {
  it("scopes the lookup to the caller's leads", async () => {
    opportunityFindFirst.mockResolvedValueOnce({ id: "opp-1" });
    const res = await call(opportunityGet, { params: { id: "opp-1" } });

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ id: "opp-1" });
    const args = opportunityFindFirst.mock.calls[0]![0] as { where: unknown };
    expect(args.where).toEqual({
      id: "opp-1",
      lead: { userId: TEST_USER.id, deletedAt: null },
    });
  });

  it("404s for somebody else's opportunity", async () => {
    opportunityFindFirst.mockResolvedValueOnce(null);
    const res = await call(opportunityGet, { params: { id: "opp-x" } });
    expect(res.status).toBe(404);
    expect(res.error).toBe("Opportunity not found");
  });
});

describe("PATCH /api/opportunities/:id", () => {
  it("writes the status and the audit row", async () => {
    opportunityFindFirst.mockResolvedValueOnce({ id: "opp-1" });
    const res = await call(opportunityPatch, {
      method: "PATCH",
      params: { id: "opp-1" },
      body: { status: "ACCEPTED" },
    });

    expect(res.status).toBe(200);
    expect(opportunityUpdate).toHaveBeenCalledWith({
      where: { id: "opp-1" },
      data: { status: "ACCEPTED" },
    });
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "opportunity.status", entityId: "opp-1" }),
    );
  });

  it("422s on a status outside the source's four", async () => {
    const res = await call(opportunityPatch, {
      method: "PATCH",
      params: { id: "opp-1" },
      body: { status: "MAYBE" },
    });
    expect(res.status).toBe(422);
    expect(res.error).toBe("Validation failed");
    expect(opportunityUpdate).not.toHaveBeenCalled();
  });

  it("400s on a body that is not JSON", async () => {
    const res = await call(opportunityPatch, {
      method: "PATCH",
      params: { id: "opp-1" },
      rawBody: "{oops",
    });
    expect(res.status).toBe(400);
    expect(res.error).toBe("Request body must be valid JSON");
  });
});

describe("PUT /api/opportunities/:id/roi", () => {
  const opportunity = {
    id: "opp-1",
    leadId: "lead-1",
    companyId: "co-1",
    title: "Manual invoice chasing",
  };

  it("stores the inputs, not the derived figures, and records the provenance", async () => {
    opportunityFindFirst.mockResolvedValueOnce(opportunity);

    const res = await call(roiPut, {
      method: "PUT",
      params: { id: "opp-1" },
      body: {
        opportunityId: "opp-1",
        employees: 4.6,
        hoursPerWeek: 6,
        hourlyCost: 42,
        projectCost: 18_000,
        prospectSupplied: true,
      },
    });

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ saved: true });

    const args = roiUpsert.mock.calls[0]![0] as { where: unknown; create: Record<string, unknown> };
    expect(args.where).toEqual({ opportunityId: "opp-1" });
    // `Math.round(input.employees)` is the source's, and none of the computed
    // figures are persisted.
    expect(args.create).toEqual({
      opportunityId: "opp-1",
      employees: 5,
      hoursPerWeek: 6,
      hourlyCost: 42,
      projectCost: 18_000,
      prospectSupplied: true,
    });

    expect(activityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "ROI_ESTIMATE_SAVED",
        summary: "ROI figures saved for Manual invoice chasing",
        detail: "Figures supplied by the prospect.",
      }),
    });
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "roi.saved",
        metadata: { prospectSupplied: true },
      }),
    );
  });

  it("accepts the JSON null the calculator sends for an unquoted project", async () => {
    opportunityFindFirst.mockResolvedValueOnce(opportunity);

    const res = await call(roiPut, {
      method: "PUT",
      params: { id: "opp-1" },
      body: {
        employees: 2,
        hoursPerWeek: 5,
        hourlyCost: 35,
        projectCost: null,
        prospectSupplied: false,
      },
    });

    expect(res.status).toBe(200);
    const args = roiUpsert.mock.calls[0]![0] as { create: { projectCost: unknown } };
    expect(args.create.projectCost).toBeNull();
    expect(activityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        detail: "Figures are our estimate, not confirmed by the prospect.",
      }),
    });
  });

  it("422s on hours outside a week", async () => {
    const res = await call(roiPut, {
      method: "PUT",
      params: { id: "opp-1" },
      body: { employees: 1, hoursPerWeek: 200, hourlyCost: 10 },
    });
    expect(res.status).toBe(422);
    expect(roiUpsert).not.toHaveBeenCalled();
  });

  it("404s for somebody else's opportunity", async () => {
    opportunityFindFirst.mockResolvedValueOnce(null);
    const res = await call(roiPut, {
      method: "PUT",
      params: { id: "opp-x" },
      body: { employees: 1, hoursPerWeek: 1, hourlyCost: 1 },
    });
    expect(res.status).toBe(404);
    expect(res.error).toBe("Opportunity not found");
  });
});
