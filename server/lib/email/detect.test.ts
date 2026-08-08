import { describe, expect, it } from "vitest";
import {
  detectAutoReply,
  detectBounce,
  detectOptOut,
  stripQuotedReply,
} from "./detect";
import { MOCK_SCENARIOS, buildMockReply, pickScenario } from "./providers/mock";

describe("detectBounce", () => {
  it("ignores an ordinary reply", () => {
    const result = detectBounce({
      from: "dana@acme.com",
      subject: "Re: Weekly reporting",
      body: "Thanks, this is interesting. What does it cost?",
    });
    expect(result.isBounce).toBe(false);
    expect(result.kind).toBe("NONE");
  });

  it("detects a mailer-daemon report and extracts the failed recipient", () => {
    const result = detectBounce({
      from: "MAILER-DAEMON@googlemail.com",
      subject: "Delivery Status Notification (Failure)",
      body: [
        "Delivery to the following recipient failed permanently:",
        "  dana@acme.com",
        "550 5.1.1 The email account that you tried to reach does not exist.",
        "Final-Recipient: rfc822; dana@acme.com",
        "Status: 5.1.1",
      ].join("\n"),
    });
    expect(result.isBounce).toBe(true);
    expect(result.kind).toBe("HARD");
    expect(result.failedRecipient).toBe("dana@acme.com");
    expect(result.reason).toContain("5.1.1");
  });

  it("classifies a full mailbox as a soft bounce", () => {
    const result = detectBounce({
      from: "postmaster@acme.com",
      subject: "Undeliverable: Weekly reporting",
      body: "452 4.2.2 The recipient's mailbox is full and over quota.",
    });
    expect(result.isBounce).toBe(true);
    expect(result.kind).toBe("SOFT");
  });

  it("treats an unrecognised report as permanent rather than retrying forever", () => {
    const result = detectBounce({
      from: "mailer-daemon@mock.local",
      subject: "Returned mail: see transcript for details",
      body: "The message could not be delivered.",
    });
    expect(result.isBounce).toBe(true);
    expect(result.kind).toBe("HARD");
  });

  it("honours a provider that has already flagged the message", () => {
    const result = detectBounce({
      from: "noreply@relay.example",
      subject: "Notification",
      body: "to <dana@acme.com>",
      isBounce: true,
    });
    expect(result.isBounce).toBe(true);
    expect(result.failedRecipient).toBe("dana@acme.com");
  });

  it("does not treat a prospect quoting an error message as a bounce", () => {
    const result = detectBounce({
      from: "dana@acme.com",
      subject: "Re: Weekly reporting",
      body: "Our system throws a 5.1.1 error every Monday, which is the problem.",
    });
    expect(result.isBounce).toBe(false);
  });
});

describe("detectOptOut", () => {
  const optOuts = [
    "Please unsubscribe me.",
    "Remove me from your list.",
    "Take us off this mailing list please.",
    "Please do not contact me again.",
    "I would like to opt out.",
    "Stop emailing me.",
    "No further contact please.",
    "STOP",
  ];

  for (const text of optOuts) {
    it(`treats "${text}" as an opt-out`, () => {
      expect(detectOptOut(text).isOptOut).toBe(true);
    });
  }

  it("does not fire on a normal reply", () => {
    expect(detectOptOut("Sounds good, let's stop by the office Tuesday.").isOptOut).toBe(
      false,
    );
    expect(detectOptOut("We can't build this internally right now.").isOptOut).toBe(
      false,
    );
  });

  it("ignores our own opt-out line quoted back in a reply", () => {
    const reply = [
      "Happy to chat next week.",
      "",
      "On Tue, Aug 4 2026, Bory wrote:",
      "> Reply STOP and I will not contact you again.",
      "> 12 Market Street",
    ].join("\n");
    expect(detectOptOut(reply).isOptOut).toBe(false);
  });

  it("ignores the footer below a signature rule", () => {
    const reply = ["Interested, tell me more.", "-- ", "Unsubscribe here"].join("\n");
    expect(detectOptOut(reply).isOptOut).toBe(false);
  });

  it("reports which phrase matched", () => {
    expect(detectOptOut("please unsubscribe").matchedPhrase).toBe("unsubscribe");
  });

  it("handles empty input", () => {
    expect(detectOptOut("").isOptOut).toBe(false);
    expect(detectOptOut(null).isOptOut).toBe(false);
  });
});

describe("stripQuotedReply", () => {
  it("keeps only what the person actually wrote", () => {
    const stripped = stripQuotedReply(
      ["My answer.", "", "On Mon, Bory wrote:", "> original text"].join("\n"),
    );
    expect(stripped).toContain("My answer.");
    expect(stripped).not.toContain("original text");
  });
});

describe("detectAutoReply", () => {
  it("detects an out-of-office", () => {
    expect(
      detectAutoReply({
        subject: "Automatic reply: Weekly reporting",
        body: "I am currently out of the office until the 14th.",
      }),
    ).toBe(true);
  });

  it("does not fire on a genuine reply", () => {
    expect(
      detectAutoReply({
        subject: "Re: Weekly reporting",
        body: "Our office manager handles this, I will forward it.",
      }),
    ).toBe(false);
  });
});

describe("mock reply corpus", () => {
  it("covers every demo scenario reply intelligence needs", () => {
    expect(MOCK_SCENARIOS.map((scenario) => scenario.key).sort()).toEqual([
      "BOUNCE",
      "INTERESTED",
      "NOT_NOW",
      "OUT_OF_OFFICE",
      "PRICE_QUESTION",
      "UNSUBSCRIBE",
    ]);
  });

  it("picks a scenario deterministically from the message id", () => {
    expect(pickScenario("msg-1").key).toBe(pickScenario("msg-1").key);
  });

  const source = {
    id: "msg-1",
    providerMessageId: "mock-msg-1",
    providerThreadId: "mock-thread-1",
    fromEmail: "bory@example.com",
    toEmail: "dana@acme.com",
    subject: "Weekly reporting",
    sentAt: new Date("2026-08-01T09:00:00Z"),
  };

  it("produces a bounce that the detector recognises and attributes", () => {
    const scenario = MOCK_SCENARIOS.find((s) => s.key === "BOUNCE")!;
    const reply = buildMockReply(source, scenario);
    expect(reply.isBounce).toBe(true);
    expect(reply.from).toBe("mailer-daemon@mock.local");

    const bounce = detectBounce(reply);
    expect(bounce.isBounce).toBe(true);
    expect(bounce.kind).toBe("HARD");
    expect(bounce.failedRecipient).toBe("dana@acme.com");
  });

  it("produces an unsubscribe request that the detector recognises", () => {
    const scenario = MOCK_SCENARIOS.find((s) => s.key === "UNSUBSCRIBE")!;
    const reply = buildMockReply(source, scenario);
    expect(detectOptOut(reply.body).isOptOut).toBe(true);
    expect(reply.from).toBe("dana@acme.com");
  });

  it("produces an out-of-office that is not mistaken for a real reply", () => {
    const scenario = MOCK_SCENARIOS.find((s) => s.key === "OUT_OF_OFFICE")!;
    const reply = buildMockReply(source, scenario);
    expect(detectAutoReply(reply)).toBe(true);
    expect(detectOptOut(reply.body).isOptOut).toBe(false);
  });

  it("produces genuine replies that trip no mechanical detector", () => {
    for (const key of ["INTERESTED", "PRICE_QUESTION", "NOT_NOW"] as const) {
      const reply = buildMockReply(source, MOCK_SCENARIOS.find((s) => s.key === key)!);
      expect(detectBounce(reply).isBounce, key).toBe(false);
      expect(detectOptOut(reply.body).isOptOut, key).toBe(false);
      expect(detectAutoReply(reply), key).toBe(false);
    }
  });

  it("derives stable ids so repeated polling never duplicates a reply", () => {
    const a = buildMockReply(source, MOCK_SCENARIOS[0]);
    const b = buildMockReply(source, MOCK_SCENARIOS[0]);
    expect(a.providerMessageId).toBe(b.providerMessageId);
    expect(a.receivedAt.getTime()).toBe(b.receivedAt.getTime());
  });
});
