import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_USER, call } from "../harness";

/**
 * The outreach endpoints that were missing. Most of them expose a read model or
 * a mutation that already existed in `server/lib/outreach/**` and was only ever
 * reachable from a server action, so the tests pin the delegation, the §4.3
 * envelope and the two places where an addressable URL needs an ownership check
 * the server action did not have.
 */

const inboxThreads = vi.fn(async () => [{ id: "thread-1" }]);
const threadDetail = vi.fn(async () => ({ id: "thread-1" }) as unknown);
const sequencesOverview = vi.fn(async () => [{ id: "seq-1" }]);
const complianceStatus = vi.fn(async () => ({
  provider: "mock",
  configured: true,
  senderName: "Demo User",
  senderEmail: "demo@example.com",
  physicalAddress: "1 Test Street",
  unsubscribeText: "Reply STOP",
  dailySendLimit: 50,
  sentToday: 3,
  suppressed: 1,
}));
const renderComplianceFooter = vi.fn(() => "-- footer --");
const enrolLead = vi.fn(async () => ({ id: "enrol-1" }));
const pauseEnrollment = vi.fn(async () => ({ id: "enrol-1", status: "PAUSED" }));
const approveForManualSend = vi.fn(async () => ({ id: "draft-1", status: "APPROVED" }));
const generateDraft = vi.fn(async () => ({
  draft: { id: "draft-2", status: "PENDING_APPROVAL" },
}));

const sequenceCreate = vi.fn(async ({ data }: { data: { name: string } }) => ({
  id: "seq-new",
  name: data.name,
}));
const enrollmentFindFirst = vi.fn(async () => ({ id: "enrol-1" }) as unknown);
const draftFindFirst = vi.fn(
  async () =>
    ({
      id: "draft-1",
      leadId: "lead-1",
      variant: "EMAIL",
      reason: "Fresh research",
    }) as unknown,
);
const draftUpdate = vi.fn(async () => ({}));

const prismaMock = {
  emailSequence: { create: sequenceCreate },
  sequenceEnrollment: { findFirst: enrollmentFindFirst },
  outreachDraft: { findFirst: draftFindFirst, update: draftUpdate },
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
vi.mock("~~/server/lib/outreach/queries", () => ({
  inboxThreads,
  threadDetail,
  sequencesOverview,
  complianceStatus,
}));
vi.mock("~~/server/lib/compliance", () => ({ renderComplianceFooter }));
vi.mock("~~/server/lib/outreach/sequences", () => ({ enrolLead, pauseEnrollment }));
vi.mock("~~/server/lib/outreach/send", () => ({ approveForManualSend }));
vi.mock("~~/server/lib/outreach/generate", () => ({ generateDraft }));

const inboxGet = (await import("../../api/outreach/inbox/index.get")).default;
const threadGet = (await import("../../api/outreach/inbox/[threadId]/index.get")).default;
const sequencesGet = (await import("../../api/outreach/sequences/index.get")).default;
const sequencesPost = (await import("../../api/outreach/sequences/index.post")).default;
const enrolPost = (await import("../../api/outreach/sequences/enrol/index.post")).default;
const pausePost = (await import("../../api/outreach/enrollments/[id]/pause/index.post"))
  .default;
const compliancePost = (await import("../../api/outreach/compliance/index.get")).default;
const approveManualPost = (
  await import("../../api/outreach/drafts/[id]/approve-manual/index.post")
).default;
const regeneratePost = (
  await import("../../api/outreach/drafts/[id]/regenerate/index.post")
).default;

beforeEach(() => {
  session = TEST_USER;
  vi.clearAllMocks();
  enrollmentFindFirst.mockResolvedValue({ id: "enrol-1" });
  draftFindFirst.mockResolvedValue({
    id: "draft-1",
    leadId: "lead-1",
    variant: "EMAIL",
    reason: "Fresh research",
  });
});

describe("GET /api/outreach/inbox", () => {
  it("returns the read model unchanged", async () => {
    const res = await call(inboxGet);
    expect(res.status).toBe(200);
    expect(res.data).toEqual([{ id: "thread-1" }]);
    expect(inboxThreads).toHaveBeenCalledWith(TEST_USER.id);
  });

  it("401s without a session", async () => {
    session = null;
    const res = await call(inboxGet);
    expect(res.status).toBe(401);
    expect(res.error).toBe("Not authenticated");
  });
});

describe("GET /api/outreach/inbox/:threadId", () => {
  it("scopes the read to the caller", async () => {
    const res = await call(threadGet, { params: { threadId: "thread-1" } });
    expect(res.status).toBe(200);
    expect(threadDetail).toHaveBeenCalledWith(TEST_USER.id, "thread-1");
  });

  it("404s for an unknown thread", async () => {
    threadDetail.mockResolvedValueOnce(null);
    const res = await call(threadGet, { params: { threadId: "nope" } });
    expect(res.status).toBe(404);
    expect(res.error).toBe("Thread not found");
  });
});

describe("/api/outreach/sequences", () => {
  it("GET returns the overview", async () => {
    const res = await call(sequencesGet);
    expect(res.data).toEqual([{ id: "seq-1" }]);
    expect(sequencesOverview).toHaveBeenCalledWith(TEST_USER.id);
  });

  it("POST creates the sequence and its steps, and audits it", async () => {
    const res = await call(sequencesPost, {
      body: {
        name: "Cold open",
        description: "Three touches",
        steps: [
          { dayOffset: 0, purpose: "First contact", channel: "EMAIL" },
          { dayOffset: 4, purpose: "Nudge", channel: "LINKEDIN" },
        ],
      },
    });

    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ name: "Cold open" });
    expect(sequenceCreate).toHaveBeenCalledWith({
      data: {
        userId: TEST_USER.id,
        name: "Cold open",
        description: "Three touches",
        steps: {
          create: [
            { dayOffset: 0, purpose: "First contact", channel: "EMAIL" },
            { dayOffset: 4, purpose: "Nudge", channel: "LINKEDIN" },
          ],
        },
      },
    });
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sequence.create", metadata: { steps: 2 } }),
    );
  });

  it("POST keeps the source's validation messages", async () => {
    const noSteps = await call(sequencesPost, { body: { name: "Cold open", steps: [] } });
    expect(noSteps.status).toBe(422);
    expect(noSteps.details).toMatchObject([
      { message: "A sequence needs at least one step" },
    ]);

    const noName = await call(sequencesPost, {
      body: { name: "", steps: [{ dayOffset: 0, purpose: "x", channel: "EMAIL" }] },
    });
    expect(noName.details).toMatchObject([{ message: "Name the sequence" }]);
  });

  it("POST rejects a channel the schema does not know", async () => {
    const res = await call(sequencesPost, {
      body: { name: "x", steps: [{ dayOffset: 0, purpose: "x", channel: "CARRIER_PIGEON" }] },
    });
    expect(res.status).toBe(422);
    expect(sequenceCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/outreach/sequences/enrol", () => {
  it("delegates to enrolLead", async () => {
    const res = await call(enrolPost, {
      body: { sequenceId: "seq-1", leadId: "lead-1" },
    });

    expect(res.status).toBe(200);
    expect(enrolLead).toHaveBeenCalledWith({
      userId: TEST_USER.id,
      sequenceId: "seq-1",
      leadId: "lead-1",
    });
  });

  it("turns enrolLead's `Sequence not found` into a 404, not a 500", async () => {
    enrolLead.mockRejectedValueOnce(new Error("Sequence not found"));
    const res = await call(enrolPost, {
      body: { sequenceId: "seq-x", leadId: "lead-1" },
    });

    expect(res.status).toBe(404);
    expect(res.error).toBe("Sequence not found");
  });
});

describe("POST /api/outreach/enrollments/:id/pause", () => {
  it("pauses with MANUAL by default", async () => {
    const res = await call(pausePost, { params: { id: "enrol-1" }, body: {} });

    expect(res.status).toBe(200);
    expect(pauseEnrollment).toHaveBeenCalledWith("enrol-1", "MANUAL", TEST_USER.id);
  });

  it("checks ownership first — pauseEnrollment updates by id alone", async () => {
    enrollmentFindFirst.mockResolvedValueOnce(null);
    const res = await call(pausePost, { params: { id: "someone-elses" }, body: {} });

    expect(res.status).toBe(404);
    expect(res.error).toBe("Enrolment not found");
    expect(pauseEnrollment).not.toHaveBeenCalled();
  });

  it("rejects a reason outside the pause vocabulary", async () => {
    const res = await call(pausePost, {
      params: { id: "enrol-1" },
      body: { reason: "BORED" },
    });
    expect(res.status).toBe(422);
    expect(pauseEnrollment).not.toHaveBeenCalled();
  });
});

describe("GET /api/outreach/compliance", () => {
  it("adds the footer the approvals page used to render itself", async () => {
    const res = await call(compliancePost);

    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ sentToday: 3, footerPreview: "-- footer --" });
    expect(renderComplianceFooter).toHaveBeenCalledWith({
      senderName: "Demo User",
      senderEmail: "demo@example.com",
      physicalAddress: "1 Test Street",
      unsubscribeText: "Reply STOP",
      dailySendLimit: 50,
    });
  });

  it("leaves the preview null while compliance is unconfigured", async () => {
    complianceStatus.mockResolvedValueOnce({
      provider: "mock",
      configured: false,
      senderName: "",
      senderEmail: "",
      physicalAddress: "",
      unsubscribeText: "",
      dailySendLimit: 50,
      sentToday: 0,
      suppressed: 0,
    });

    const res = await call(compliancePost);
    expect(res.data).toMatchObject({ footerPreview: null });
    expect(renderComplianceFooter).not.toHaveBeenCalled();
  });
});

describe("POST /api/outreach/drafts/:id/approve-manual", () => {
  it("requires an explicit approve:true", async () => {
    const res = await call(approveManualPost, {
      params: { id: "draft-1" },
      body: { approve: true },
    });

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ id: "draft-1", status: "APPROVED" });
    expect(approveForManualSend).toHaveBeenCalledWith({
      userId: TEST_USER.id,
      draftId: "draft-1",
    });
  });

  it("422s when approval is only implied", async () => {
    const res = await call(approveManualPost, {
      params: { id: "draft-1" },
      body: { approve: false },
    });

    expect(res.status).toBe(422);
    expect(approveForManualSend).not.toHaveBeenCalled();
  });
});

describe("POST /api/outreach/drafts/:id/regenerate", () => {
  it("passes the hint to the agent and supersedes the old draft", async () => {
    const res = await call(regeneratePost, {
      params: { id: "draft-1" },
      body: { hint: "SHORTER" },
    });

    expect(res.status).toBe(201);
    // The point of the endpoint: `regenerationHint` reaches `generateDraft`,
    // which the drafts+reject composition dropped.
    expect(generateDraft).toHaveBeenCalledWith({
      userId: TEST_USER.id,
      leadId: "lead-1",
      variant: "EMAIL",
      reason: "Fresh research",
      regenerationOf: "draft-1",
      regenerationHint: "SHORTER",
    });
    expect(draftUpdate).toHaveBeenCalledWith({
      where: { id: "draft-1" },
      data: expect.objectContaining({
        status: "REJECTED",
        rejectionReason: "Regenerated (SHORTER)",
      }),
    });
  });

  it("falls back to EMAIL when the stored variant is unrecognised", async () => {
    draftFindFirst.mockResolvedValueOnce({
      id: "draft-1",
      leadId: "lead-1",
      variant: "SEMAPHORE",
      reason: null,
    });

    await call(regeneratePost, { params: { id: "draft-1" }, body: { hint: "FRIENDLIER" } });
    expect(generateDraft).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "EMAIL" }),
    );
  });

  it("422s on an unknown hint", async () => {
    const res = await call(regeneratePost, {
      params: { id: "draft-1" },
      body: { hint: "SPICIER" },
    });

    expect(res.status).toBe(422);
    expect(generateDraft).not.toHaveBeenCalled();
  });

  it("404s for a draft that is not the caller's", async () => {
    draftFindFirst.mockResolvedValueOnce(null);
    const res = await call(regeneratePost, {
      params: { id: "draft-x" },
      body: { hint: "SHORTER" },
    });

    expect(res.status).toBe(404);
    expect(res.error).toBe("Draft not found");
  });
});
