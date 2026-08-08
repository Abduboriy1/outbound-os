import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  approveAndSendAction,
  generateDraftAction,
  regenerateDraftAction,
  rejectDraftAction,
  runSequencesAction,
  sweepFollowUpsAction,
} from "./actions";

/**
 * These are the ports of `src/app/(app)/outreach/actions.ts`. The guarantees
 * worth pinning are the ones the server actions made: the same validation
 * messages before anything is called, the endpoint and body each action hits,
 * and the server's own error string coming back unchanged (which is how
 * "Blocked by compliance: …" reaches the card).
 *
 * `$fetch` is a Nuxt auto-import, so it is stubbed on the global object —
 * MIGRATION.md §7.
 */
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("$fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("approveAndSendAction", () => {
  it("refuses an empty body without calling the endpoint", async () => {
    const state = await approveAndSendAction({
      draftId: "d1",
      channel: "EMAIL",
      body: "",
    });

    expect(state).toEqual({ error: "The message body is empty" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the approve endpoint with an explicit approve flag", async () => {
    fetchMock.mockResolvedValue({ data: { providerMessageId: "msg-1" } });

    const state = await approveAndSendAction({
      draftId: "d1",
      channel: "EMAIL",
      subject: "Hello",
      body: "Body text",
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/outreach/drafts/d1/approve", {
      method: "POST",
      body: { approve: true, subject: "Hello", bodyText: "Body text" },
    });
    expect(state).toEqual({ message: "Sent (msg-1)." });
  });

  it("surfaces the server's compliance message unchanged", async () => {
    fetchMock.mockRejectedValue({
      data: { error: "Blocked by compliance: address is suppressed" },
    });

    const state = await approveAndSendAction({
      draftId: "d1",
      channel: "EMAIL",
      body: "Body text",
    });

    expect(state).toEqual({
      error: "Blocked by compliance: address is suppressed",
    });
  });

  it("never hits the sending endpoint for a non-email channel", async () => {
    fetchMock.mockResolvedValue({ data: {} });

    const state = await approveAndSendAction({
      draftId: "d1",
      channel: "LINKEDIN",
      body: "Body text",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/outreach/drafts/d1/approve-manual",
    );
    expect(state).toEqual({
      message: "Approved. A task was created to send it by hand.",
    });
  });
});

describe("rejectDraftAction", () => {
  it("requires a reason so the agent can learn from it", async () => {
    const state = await rejectDraftAction({ draftId: "d1", reason: "   " });

    expect(state).toEqual({
      error: "Give a reason so the agent can learn from it",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("trims the reason before sending it", async () => {
    fetchMock.mockResolvedValue({ data: {} });

    const state = await rejectDraftAction({
      draftId: "d1",
      reason: "  wrong contact  ",
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/outreach/drafts/d1/reject", {
      method: "POST",
      body: { reason: "wrong contact" },
    });
    expect(state).toEqual({ message: "Draft rejected." });
  });
});

describe("regenerateDraftAction", () => {
  it("rejects an unknown hint", async () => {
    const state = await regenerateDraftAction({
      draftId: "d1",
      hint: "SPICIER",
      leadId: "l1",
      variant: "EMAIL",
      reason: null,
    });

    expect(state).toEqual({ error: "Unknown regeneration option" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the hint to the regenerate endpoint in one call", async () => {
    fetchMock.mockResolvedValue({ data: {} });

    const state = await regenerateDraftAction({
      draftId: "d1",
      hint: "SHORTER",
      leadId: "l1",
      variant: "SHORT",
      reason: "manual reporting",
    });

    // One call, and the hint is in the body — this is what makes "Shorter"
    // reach the model rather than only relabelling the rejection.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/outreach/drafts/d1/regenerate",
      { method: "POST", body: { hint: "SHORTER" } },
    );
    expect(state).toEqual({ message: "Regenerated." });
  });

  it("returns the server's message when the endpoint fails", async () => {
    fetchMock.mockRejectedValue({ data: { error: "Draft not found" } });

    const state = await regenerateDraftAction({
      draftId: "d1",
      hint: "SHORTER",
      leadId: "l1",
      variant: "EMAIL",
      reason: null,
    });

    expect(state).toEqual({ error: "Draft not found" });
  });
});

describe("generateDraftAction", () => {
  it("validates the variant against the shared list", async () => {
    const state = await generateDraftAction({ leadId: "l1", variant: "NOPE" });

    expect(state).toEqual({ error: "Invalid option" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queues a draft for approval", async () => {
    fetchMock.mockResolvedValue({ data: {} });

    const state = await generateDraftAction({
      leadId: "l1",
      variant: "EMAIL",
      reason: "",
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/outreach/drafts", {
      method: "POST",
      body: { leadId: "l1", variant: "EMAIL", reason: undefined },
    });
    expect(state).toEqual({ message: "Draft added to the approval queue." });
  });
});

describe("the run/sweep buttons", () => {
  it("reports what advancing the sequences did", async () => {
    fetchMock.mockResolvedValue({
      data: { generated: 2, paused: ["e1"], completed: 1 },
    });

    expect(await runSequencesAction()).toEqual({
      message:
        "2 draft(s) queued for approval, 1 enrolment(s) paused, 1 completed.",
    });
  });

  it("reports what the follow-up sweep did", async () => {
    fetchMock.mockResolvedValue({ data: { created: 3, flagged: ["l1", "l2"] } });

    expect(await sweepFollowUpsAction()).toEqual({
      message: "3 follow-up task(s) created, 2 lead(s) flagged.",
    });
  });

  it("falls back to a generic message when the failure carries no body", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    expect(await runSequencesAction()).toEqual({ error: "network down" });
  });
});
