import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_USER, call } from "../harness";

/**
 * The lead sub-resources. Three of them wrap mutations that already exist in
 * `server/lib/leads/mutations.ts` and were only ever reachable from a server
 * action, so what the tests pin is that the endpoint calls *that* function with
 * the source's parsed input — `setNextAction` is the one that writes the
 * `NEXT_ACTION_SET` / `NEXT_ACTION_CLEARED` activity a `PATCH /api/leads/:id`
 * would have skipped. The rest are ports of the tab queries.
 */

const leadFindFirst = vi.fn(async () => ({ id: "lead-1" }) as unknown);
const prismaMock = {
  lead: { findFirst: leadFindFirst },
  emailThread: { findMany: vi.fn(async () => [{ id: "t-1" }]) },
  outreachDraft: { findMany: vi.fn(async () => [{ id: "d-1" }]) },
  meeting: { findMany: vi.fn(async () => [{ id: "m-1" }]) },
  opportunity: { findMany: vi.fn(async () => [{ id: "o-1" }]) },
  proposal: { findMany: vi.fn(async () => [{ id: "p-1" }]) },
};

const setNextAction = vi.fn(async () => ({ id: "lead-1" }));
const addLeadNote = vi.fn(async () => {});
const logContactMade = vi.fn(async () => {});
const listLeadActivities = vi.fn(async () => [{ id: "a-1" }]);
const listLeadStageHistory = vi.fn(async () => [{ id: "h-1" }]);
const enqueue = vi.fn(async () => ({ mode: "queued" as const, jobId: "1" }));

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
vi.mock("~~/server/lib/leads/mutations", () => ({
  setNextAction,
  addLeadNote,
  logContactMade,
}));
vi.mock("~~/server/lib/leads/queries", () => ({
  listLeadActivities,
  listLeadStageHistory,
}));
vi.mock("~~/server/lib/queue", () => ({ enqueue }));

const nextActionPost = (await import("../../api/leads/[id]/next-action/index.post")).default;
const notesPost = (await import("../../api/leads/[id]/notes/index.post")).default;
const contactLogPost = (await import("../../api/leads/[id]/contact-log/index.post")).default;
const emailsGet = (await import("../../api/leads/[id]/emails/index.get")).default;
const meetingsGet = (await import("../../api/leads/[id]/meetings/index.get")).default;
const opportunitiesGet = (await import("../../api/leads/[id]/opportunities/index.get")).default;
const proposalsGet = (await import("../../api/leads/[id]/proposals/index.get")).default;
const activitiesGet = (await import("../../api/leads/[id]/activities/index.get")).default;
const rescorePost = (await import("../../api/leads/[id]/rescore/index.post")).default;

beforeEach(() => {
  session = TEST_USER;
  vi.clearAllMocks();
  leadFindFirst.mockResolvedValue({ id: "lead-1" });
});

describe("POST /api/leads/:id/next-action", () => {
  it("sets an action with its due date through setNextAction", async () => {
    const res = await call(nextActionPost, {
      params: { id: "lead-1" },
      body: { nextAction: "Send the follow-up", nextActionDueAt: "2026-08-10" },
    });

    expect(res.status).toBe(200);
    expect(setNextAction).toHaveBeenCalledWith({ userId: TEST_USER.id }, "lead-1", {
      nextAction: "Send the follow-up",
      nextActionDueAt: new Date("2026-08-10"),
    });
  });

  it("clears it — the tasks page's Done button — without touching anything else", async () => {
    const res = await call(nextActionPost, {
      params: { id: "lead-1" },
      body: { nextAction: null, nextActionDueAt: null },
    });

    expect(res.status).toBe(200);
    expect(setNextAction).toHaveBeenCalledWith({ userId: TEST_USER.id }, "lead-1", {
      nextAction: null,
      nextActionDueAt: null,
    });
  });

  it("treats an empty string as null, the way the source's schema does", async () => {
    await call(nextActionPost, {
      params: { id: "lead-1" },
      body: { nextAction: "", nextActionDueAt: "" },
    });

    expect(setNextAction).toHaveBeenCalledWith({ userId: TEST_USER.id }, "lead-1", {
      nextAction: null,
      nextActionDueAt: null,
    });
  });

  it("401s without a session", async () => {
    session = null;
    const res = await call(nextActionPost, { params: { id: "lead-1" }, body: {} });
    expect(res.status).toBe(401);
    expect(setNextAction).not.toHaveBeenCalled();
  });
});

describe("POST /api/leads/:id/notes", () => {
  it("trims and forwards the note", async () => {
    const res = await call(notesPost, {
      params: { id: "lead-1" },
      body: { note: "  Spoke to Jo about invoicing  " },
    });

    expect(res.status).toBe(201);
    expect(addLeadNote).toHaveBeenCalledWith(
      { userId: TEST_USER.id },
      "lead-1",
      "Spoke to Jo about invoicing",
    );
  });

  it("422s on an empty note with the source's message", async () => {
    const res = await call(notesPost, { params: { id: "lead-1" }, body: { note: "   " } });

    expect(res.status).toBe(422);
    expect(res.error).toBe("Validation failed");
    expect(res.details).toMatchObject([{ message: "A note cannot be empty" }]);
    expect(addLeadNote).not.toHaveBeenCalled();
  });
});

describe("POST /api/leads/:id/contact-log", () => {
  it("forwards the summary", async () => {
    const res = await call(contactLogPost, {
      params: { id: "lead-1" },
      body: { summary: "Called; they asked for a proposal" },
    });

    expect(res.status).toBe(201);
    expect(logContactMade).toHaveBeenCalledWith(
      { userId: TEST_USER.id },
      "lead-1",
      "Called; they asked for a proposal",
    );
  });

  it("422s on an empty summary with the source's message", async () => {
    const res = await call(contactLogPost, {
      params: { id: "lead-1" },
      body: { summary: "" },
    });
    expect(res.status).toBe(422);
    expect(res.details).toMatchObject([{ message: "Describe what happened" }]);
  });
});

describe("the lead tab endpoints", () => {
  it("emails: threads with messages in send order, plus the drafts", async () => {
    const res = await call(emailsGet, { params: { id: "lead-1" } });

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ threads: [{ id: "t-1" }], drafts: [{ id: "d-1" }] });
    expect(prismaMock.emailThread.findMany).toHaveBeenCalledWith({
      where: { leadId: "lead-1" },
      orderBy: { lastMessageAt: "desc" },
      include: { messages: { orderBy: { sentAt: "asc" } } },
    });
    expect(prismaMock.outreachDraft.findMany).toHaveBeenCalledWith({
      where: { leadId: "lead-1" },
      orderBy: { createdAt: "desc" },
    });
  });

  it("meetings: newest first, with notes and summaries", async () => {
    await call(meetingsGet, { params: { id: "lead-1" } });

    expect(prismaMock.meeting.findMany).toHaveBeenCalledWith({
      where: { leadId: "lead-1" },
      orderBy: { scheduledAt: "desc" },
      include: {
        notes: { orderBy: { createdAt: "asc" } },
        summaries: { orderBy: { createdAt: "desc" } },
      },
    });
  });

  it("opportunities: strongest first, with the ROI row", async () => {
    await call(opportunitiesGet, { params: { id: "lead-1" } });

    expect(prismaMock.opportunity.findMany).toHaveBeenCalledWith({
      where: { leadId: "lead-1" },
      orderBy: { confidence: "desc" },
      include: { roi: true },
    });
  });

  it("proposals: newest first, every version newest first", async () => {
    await call(proposalsGet, { params: { id: "lead-1" } });

    expect(prismaMock.proposal.findMany).toHaveBeenCalledWith({
      where: { leadId: "lead-1" },
      orderBy: { createdAt: "desc" },
      include: { versions: { orderBy: { version: "desc" } } },
    });
  });

  it("activities: the full 200-row list plus the stage history", async () => {
    const res = await call(activitiesGet, { params: { id: "lead-1" } });

    expect(res.data).toEqual({
      activities: [{ id: "a-1" }],
      history: [{ id: "h-1" }],
    });
    expect(listLeadActivities).toHaveBeenCalledWith(TEST_USER.id, "lead-1");
    expect(listLeadStageHistory).toHaveBeenCalledWith("lead-1");
  });

  it("404 on a lead that is not the caller's, for every tab", async () => {
    leadFindFirst.mockResolvedValue(null);
    for (const handler of [
      emailsGet,
      meetingsGet,
      opportunitiesGet,
      proposalsGet,
      activitiesGet,
    ]) {
      const res = await call(handler, { params: { id: "someone-elses" } });
      expect(res.status).toBe(404);
      expect(res.error).toBe("Lead not found");
    }
  });
});

describe("POST /api/leads/:id/rescore", () => {
  it("queues a scoring job and answers 202", async () => {
    const res = await call(rescorePost, { params: { id: "lead-1" } });

    expect(res.status).toBe(202);
    expect(res.data).toEqual({ mode: "queued", error: null });
    expect(enqueue).toHaveBeenCalledWith("scoring", {
      leadId: "lead-1",
      userId: TEST_USER.id,
    });
  });

  it("404s rather than queueing work for somebody else's lead", async () => {
    leadFindFirst.mockResolvedValue(null);
    const res = await call(rescorePost, { params: { id: "nope" } });

    expect(res.status).toBe(404);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
