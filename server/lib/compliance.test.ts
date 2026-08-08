import { describe, expect, it } from "vitest";
import {
  appendComplianceFooter,
  evaluateSendability,
  isValidEmail,
  normaliseEmail,
  renderComplianceFooter,
  startOfUtcDay,
  type SendabilitySnapshot,
  type SenderIdentity,
} from "./compliance";

const identity: SenderIdentity = {
  senderName: "Bory Umarov",
  senderEmail: "bory@example.com",
  physicalAddress: "12 Market Street\nTashkent, Uzbekistan",
  unsubscribeText: "Reply STOP and I will not contact you again.",
  dailySendLimit: 50,
};

function snapshot(overrides: Partial<SendabilitySnapshot> = {}): SendabilitySnapshot {
  return {
    email: "dana@acmelogistics.com",
    leadStage: "READY_FOR_OUTREACH",
    suppression: null,
    hasBounced: false,
    sentToday: 0,
    identity,
    ...overrides,
  };
}

function codes(result: ReturnType<typeof evaluateSendability>) {
  return result.allowed ? [] : result.blocks.map((block) => block.code);
}

describe("evaluateSendability", () => {
  it("allows a clean send and returns the identity to stamp with", () => {
    const result = evaluateSendability(snapshot());
    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.identity.senderEmail).toBe("bory@example.com");
  });

  it("blocks an address that is not a valid email", () => {
    expect(codes(evaluateSendability(snapshot({ email: "not-an-email" })))).toContain(
      "INVALID_ADDRESS",
    );
    expect(codes(evaluateSendability(snapshot({ email: "" })))).toContain(
      "INVALID_ADDRESS",
    );
    expect(codes(evaluateSendability(snapshot({ email: "a@b" })))).toContain(
      "INVALID_ADDRESS",
    );
  });

  describe("suppression list", () => {
    const reasons = [
      "UNSUBSCRIBED",
      "BOUNCED",
      "COMPLAINT",
      "DO_NOT_CONTACT",
      "MANUAL",
    ] as const;

    for (const reason of reasons) {
      it(`blocks anyone suppressed as ${reason}`, () => {
        const result = evaluateSendability(
          snapshot({ suppression: { reason } }),
        );
        expect(result.allowed).toBe(false);
        expect(codes(result)).toContain("SUPPRESSED");
      });
    }

    it("does not double-report a bounce that is already suppressed", () => {
      const result = evaluateSendability(
        snapshot({ suppression: { reason: "BOUNCED" }, hasBounced: true }),
      );
      expect(codes(result)).toEqual(["SUPPRESSED"]);
    });
  });

  it("blocks contacts whose lead is DO_NOT_CONTACT", () => {
    expect(
      codes(evaluateSendability(snapshot({ leadStage: "DO_NOT_CONTACT" }))),
    ).toContain("UNCONTACTABLE_STAGE");
  });

  it("blocks contacts whose lead is NOT_A_FIT", () => {
    expect(
      codes(evaluateSendability(snapshot({ leadStage: "NOT_A_FIT" }))),
    ).toContain("UNCONTACTABLE_STAGE");
  });

  it("allows other off-pipeline stages such as FOLLOW_UP_LATER", () => {
    expect(
      evaluateSendability(snapshot({ leadStage: "FOLLOW_UP_LATER" })).allowed,
    ).toBe(true);
  });

  it("blocks an address that previously bounced even with no suppression row", () => {
    expect(codes(evaluateSendability(snapshot({ hasBounced: true })))).toContain(
      "BOUNCED",
    );
  });

  it("blocks once the daily send limit is reached", () => {
    expect(codes(evaluateSendability(snapshot({ sentToday: 50 })))).toContain(
      "DAILY_LIMIT",
    );
    expect(codes(evaluateSendability(snapshot({ sentToday: 51 })))).toContain(
      "DAILY_LIMIT",
    );
    expect(evaluateSendability(snapshot({ sentToday: 49 })).allowed).toBe(true);
  });

  it("respects a per-user limit rather than a constant", () => {
    const result = evaluateSendability(
      snapshot({
        sentToday: 5,
        identity: { ...identity, dailySendLimit: 5 },
      }),
    );
    expect(codes(result)).toContain("DAILY_LIMIT");
  });

  it("refuses to send when compliance settings were never configured", () => {
    const result = evaluateSendability(snapshot({ identity: null }));
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        "SENDER_IDENTITY_MISSING",
        "PHYSICAL_ADDRESS_MISSING",
      ]),
    );
  });

  it("refuses to send without a sender name or sender email", () => {
    expect(
      codes(
        evaluateSendability(
          snapshot({ identity: { ...identity, senderEmail: "  " } }),
        ),
      ),
    ).toContain("SENDER_IDENTITY_MISSING");
    expect(
      codes(
        evaluateSendability(
          snapshot({ identity: { ...identity, senderName: "" } }),
        ),
      ),
    ).toContain("SENDER_IDENTITY_MISSING");
  });

  it("refuses to send without a physical mailing address", () => {
    expect(
      codes(
        evaluateSendability(
          snapshot({ identity: { ...identity, physicalAddress: "   " } }),
        ),
      ),
    ).toContain("PHYSICAL_ADDRESS_MISSING");
  });

  it("reports every applicable block, not just the first", () => {
    const result = evaluateSendability(
      snapshot({
        email: "nope",
        leadStage: "DO_NOT_CONTACT",
        suppression: { reason: "UNSUBSCRIBED" },
        hasBounced: true,
        sentToday: 99,
      }),
    );
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        "INVALID_ADDRESS",
        "SUPPRESSED",
        "UNCONTACTABLE_STAGE",
        "BOUNCED",
        "DAILY_LIMIT",
      ]),
    );
  });
});

describe("footer rules", () => {
  it("appends sender identity, physical address and opt-out line", () => {
    const body = appendComplianceFooter("Hi Dana,\n\nQuick question.", identity);
    expect(body).toContain("Hi Dana,");
    expect(body).toContain("Bory Umarov");
    expect(body).toContain("bory@example.com");
    expect(body).toContain("12 Market Street, Tashkent, Uzbekistan");
    expect(body).toContain("Reply STOP and I will not contact you again.");
  });

  it("is idempotent so re-stamping an edited draft does not stack footers", () => {
    const once = appendComplianceFooter("Hello.", identity);
    const twice = appendComplianceFooter(once, identity);
    expect(twice).toBe(once);
    expect(twice.match(/12 Market Street/g)).toHaveLength(1);
  });

  it("flattens a multi-line address onto one line", () => {
    expect(renderComplianceFooter(identity)).toContain(
      "12 Market Street, Tashkent, Uzbekistan",
    );
  });

  it("falls back to a default opt-out line when none is configured", () => {
    const footer = renderComplianceFooter({ ...identity, unsubscribeText: "  " });
    expect(footer).toContain("Reply STOP and I will not contact you again.");
  });

  it("keeps the footer separated from the body by a signature rule", () => {
    expect(appendComplianceFooter("Body.", identity)).toContain("\n-- \n");
  });
});

describe("helpers", () => {
  it("normalises addresses for comparison against the suppression list", () => {
    expect(normaliseEmail("  Dana@Acme.COM ")).toBe("dana@acme.com");
    expect(normaliseEmail(null)).toBe("");
  });

  it("rejects addresses with separators that could smuggle a second recipient", () => {
    expect(isValidEmail("a@b.com, c@d.com")).toBe(false);
    expect(isValidEmail("a@b.com;c@d.com")).toBe(false);
    expect(isValidEmail("dana@acme.co.uk")).toBe(true);
  });

  it("computes the UTC day boundary used by the daily limit", () => {
    expect(startOfUtcDay(new Date("2026-08-07T23:59:00Z")).toISOString()).toBe(
      "2026-08-07T00:00:00.000Z",
    );
  });
});
