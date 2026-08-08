import { describe, expect, it } from "vitest";
import { generateMockReply } from "./reply";
import type { MockInput } from "../providers/mock";

function input(body: string): MockInput {
  return {
    request: {
      agent: "reply",
      system: "",
      instruction: "",
      responseSchema: {},
    },
    context: {},
    documents: [{ label: "Prospect reply", content: body }],
    signals: [],
    companyName: "Thornbury Distribution",
    seeded: (_salt, min, max) => (min + max) / 2,
  };
}

describe("mock reply generator", () => {
  it("classifies an opt-out and refuses to draft a response", () => {
    const out = generateMockReply(input("Please remove me from your list."));

    expect(out.intent).toBe("UNSUBSCRIBE");
    expect(out.optOutRequested).toBe(true);
    expect(out.pauseSequence).toBe(true);
    expect(out.draftReply).toBeNull();
    expect(out.suggestedFollowUpDays).toBeNull();
  });

  it("extracts the prospect's questions as they wrote them", () => {
    const out = generateMockReply(
      input("This is interesting. How much would something like this cost? And how long would it take?"),
    );

    expect(out.questions).toEqual([
      "How much would something like this cost?",
      "And how long would it take?",
    ]);
    expect(out.buyingSignals).toContain("Asked about price");
    expect(out.recommendedAction).toMatch(/ranges/i);
    expect(out.draftReply?.body).toBeTruthy();
  });

  it("detects objections and maps them to playbook keys", () => {
    const out = generateMockReply(
      input("We already have software for this, and honestly it feels too expensive right now."),
    );

    const keys = out.objections.map((o) => o.playbookKey);
    expect(keys).toContain("already_have_software");
    expect(keys).toContain("too_expensive");
  });

  it("does not draft a reply to an out-of-office bounce-back", () => {
    const out = generateMockReply(input("Automatic reply: I am out of office until Monday."));

    expect(out.intent).toBe("OUT_OF_OFFICE");
    expect(out.draftReply).toBeNull();
    expect(out.suggestedFollowUpDays).toBe(7);
  });

  // The whole point of the hand-written generator: no field-shaped filler.
  it("never emits placeholder text", () => {
    const out = generateMockReply(input("Happy to chat. When are you free?"));
    const serialised = JSON.stringify(out);

    expect(serialised).not.toMatch(/\(mock\)/);
    expect(out.summary).toContain("Thornbury Distribution");
  });
});

describe("reads documents wrapped into the instruction", () => {
  // The reply agent embeds its untrusted blocks in the instruction rather than
  // passing request.data, so reading documents alone would see nothing.
  function inlined(body: string): MockInput {
    const base = input("");
    return {
      ...base,
      documents: [],
      request: {
        ...base.request,
        instruction: [
          "Analyse the reply.",
          `--- BEGIN UNTRUSTED DOCUMENT 1 label: Prospect reply source-url: none ---`,
          body,
          "--- END UNTRUSTED DOCUMENT 1 ---",
        ].join("\n"),
      },
    };
  }

  it("recovers the reply text from the untrusted block", () => {
    const out = generateMockReply(
      inlined("Interesting. What would something like this cost, and how long would it take?"),
    );

    expect(out.intent).toBe("NEEDS_INFO");
    expect(out.questions.length).toBeGreaterThan(0);
    expect(out.summary).not.toMatch(/replied: other/);
  });
});

describe("classification does not mistake context for rejection", () => {
  it("treats a buyer describing their stack as engaged, not uninterested", () => {
    const out = generateMockReply(
      input("Do you work with the systems we already have, or does everything need replacing?"),
    );

    expect(out.intent).not.toBe("NOT_INTERESTED");
    expect(out.questions.length).toBeGreaterThan(0);
  });

  it("still recognises an explicit rejection", () => {
    const out = generateMockReply(input("Not interested, we already have a vendor for this."));
    expect(out.intent).toBe("NOT_INTERESTED");
    expect(out.draftReply).toBeNull();
  });
});

describe("deferral is not the same as rejection", () => {
  it("reads a real problem parked behind other work as NOT_NOW", () => {
    const out = generateMockReply(
      input(
        "This is a real problem for us but it is not a priority this quarter - we are mid-way through an ERP migration and nobody has bandwidth. Try me again after the new year.",
      ),
    );

    expect(out.intent).toBe("NOT_NOW");
    expect(out.suggestedFollowUpDays).toBe(60);
    expect(out.recommendedAction).toMatch(/date to revisit/i);
  });
});
