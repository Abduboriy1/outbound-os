import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ApprovalCard from "./ApprovalCard.vue";
import type { ApprovalDraft } from "./types";

/**
 * The approval queue is the one screen where being wrong sends an email, so
 * the guarantees pinned here are the ones from plan §16: nothing sends without
 * a click, a blocked draft cannot be submitted at all, and what the operator
 * edited is what gets posted.
 */
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ data: { providerMessageId: "msg-1" } });
  vi.stubGlobal("$fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function draft(overrides: Partial<ApprovalDraft> = {}): ApprovalDraft {
  return {
    id: "d1",
    leadId: "l1",
    companyName: "Northwind Logistics",
    contactName: "Ada Byron",
    contactEmail: "ada@northwind.test",
    contactTitle: "COO",
    channel: "EMAIL",
    variant: "EMAIL",
    subject: "Northwind weekly reporting",
    body: "Hi Ada,",
    reason: "manual reporting",
    score: 72,
    stage: "QUALIFIED",
    regenerationHint: null,
    regeneratedFrom: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    blocks: [],
    placeholders: [],
    ...overrides,
  };
}

function mountCard(overrides: Partial<ApprovalDraft> = {}, footer: string | null = null) {
  return mount(ApprovalCard, {
    props: { draft: draft(overrides), footerPreview: footer },
    global: { plugins: [[PrimeVue, { theme: "none" }]] },
  });
}

/** The approve form is the first one on the card, as it is in the source. */
function approveForm(wrapper: ReturnType<typeof mountCard>) {
  return wrapper.findAll("form")[0]!;
}

describe("ApprovalCard", () => {
  it("shows the lead context the operator needs to judge the draft", () => {
    const text = mountCard().text();

    expect(text).toContain("Northwind Logistics");
    expect(text).toContain("Qualified");
    expect(text).toContain("Score 72");
    expect(text).toContain("Reason: manual reporting");
    expect(text).toContain("Ada Byron, COO <ada@northwind.test>");
  });

  it("sends nothing on mount", () => {
    mountCard();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the approval with an explicit approve flag", async () => {
    const wrapper = mountCard();

    await approveForm(wrapper).trigger("submit");
    await nextTick();

    expect(fetchMock).toHaveBeenCalledWith("/api/outreach/drafts/d1/approve", {
      method: "POST",
      body: {
        approve: true,
        subject: "Northwind weekly reporting",
        bodyText: "Hi Ada,",
      },
    });
    expect(wrapper.emitted("result")?.[0]).toEqual([{ message: "Sent (msg-1)." }]);
  });

  it("posts what was typed in edit mode", async () => {
    const wrapper = mountCard();

    await wrapper.findAll("button")[1]!.trigger("click"); // "Edit"
    await nextTick();

    await wrapper.find('input[name="subject"]').setValue("Reworked subject");
    await wrapper.find('textarea[name="body"]').setValue("Reworked body");
    await approveForm(wrapper).trigger("submit");
    await nextTick();

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: { subject: "Reworked subject", bodyText: "Reworked body" },
    });
  });

  it("disables approval and explains why when compliance blocks the send", () => {
    const wrapper = mountCard({
      blocks: [{ code: "SUPPRESSED", message: "The address is suppressed." }],
    });

    const approve = wrapper.findAll("button").find((b) => b.text().includes("Approve"))!;
    expect(approve.attributes("disabled")).toBeDefined();
    expect(approve.attributes("title")).toBe(
      "Resolve the blocks above before sending",
    );
    expect(wrapper.text()).toContain("Compliance blocks this send");
    expect(wrapper.text()).toContain("The address is suppressed.");
  });

  it("disables approval while placeholders are still unfilled", () => {
    const wrapper = mountCard({ placeholders: ["{{firstName}}"] });

    const approve = wrapper.findAll("button").find((b) => b.text().includes("Approve"))!;
    expect(approve.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("Unfilled placeholders: {{firstName}}");
  });

  it("offers manual approval rather than sending on a non-email channel", () => {
    const wrapper = mountCard({ channel: "LINKEDIN" });

    expect(wrapper.text()).toContain("Approve for manual send");
    expect(wrapper.text()).not.toContain("Approve & Send");
  });

  it("keeps the reject form hidden until Reject is clicked", async () => {
    const wrapper = mountCard();

    expect(wrapper.find('input[name="reason"]').exists()).toBe(false);

    await wrapper
      .findAll("button")
      .find((b) => b.text() === "Reject")!
      .trigger("click");
    await nextTick();

    expect(wrapper.find('input[name="reason"]').exists()).toBe(true);
  });

  it("shows the compliance footer preview only when there is one", () => {
    expect(mountCard().text()).not.toContain("Compliance footer appended on send");
    expect(mountCard({}, "Sent by Acme, 1 Main St").text()).toContain(
      "Compliance footer appended on send",
    );
  });

  it("keeps the superseded draft available for review", () => {
    const wrapper = mountCard({
      regenerationHint: "SHORTER",
      regeneratedFrom: { id: "d0", body: "The long-winded original." },
    });

    expect(wrapper.text()).toContain("Regenerated: Shorter");
    expect(wrapper.text()).toContain("Previous draft");
    expect(wrapper.text()).toContain("The long-winded original.");
  });
});
