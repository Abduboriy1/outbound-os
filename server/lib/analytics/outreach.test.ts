import { describe, expect, it } from "vitest";
import type { ReplyIntent } from "~~/server/generated/prisma/client";
import { computeOutreachStats } from "./outreach";
import type { ReplyRow, SentMessageRow } from "./types";

function sent(count: number, bounced = 0): SentMessageRow[] {
  return Array.from({ length: count }, (_, i) => ({
    sentAt: new Date("2026-08-01T00:00:00Z"),
    bounced: i < bounced,
  }));
}

function reply(intent: ReplyIntent | null): ReplyRow {
  return { intent, receivedAt: new Date("2026-08-02T00:00:00Z") };
}

describe("computeOutreachStats", () => {
  it("counts only messages that actually went out", () => {
    const rows: SentMessageRow[] = [
      { sentAt: new Date("2026-08-01Z"), bounced: false },
      { sentAt: null, bounced: false },
    ];
    expect(computeOutreachStats(rows, []).sent).toBe(1);
  });

  it("computes bounce rate against everything sent", () => {
    const result = computeOutreachStats(sent(100, 4), []);
    expect(result.bounced).toBe(4);
    expect(result.bounceRate).toBe(4);
  });

  it("computes reply rate against delivered messages, not bounced ones", () => {
    const result = computeOutreachStats(sent(100, 20), [
      reply("INTERESTED"),
      reply("NOT_INTERESTED"),
      reply("NOT_INTERESTED"),
      reply("NOT_INTERESTED"),
      reply("NOT_INTERESTED"),
      reply("NOT_INTERESTED"),
      reply("NOT_INTERESTED"),
      reply("NOT_INTERESTED"),
    ]);
    expect(result.replies).toBe(8);
    expect(result.replyRate).toBe(10); // 8 of 80 delivered
  });

  it("excludes auto-responders from the reply count", () => {
    const result = computeOutreachStats(sent(10), [
      reply("INTERESTED"),
      reply("OUT_OF_OFFICE"),
      reply("AUTO_REPLY"),
    ]);
    expect(result.replies).toBe(1);
  });

  it("counts an unclassified reply as a human reply", () => {
    expect(computeOutreachStats(sent(10), [reply(null)]).replies).toBe(1);
  });

  it("treats interest, questions and referrals as positive", () => {
    const result = computeOutreachStats(sent(20), [
      reply("INTERESTED"),
      reply("NEEDS_INFO"),
      reply("QUESTION"),
      reply("REFERRED_TO_OTHER"),
      reply("NOT_INTERESTED"),
      reply("NOT_NOW"),
    ]);
    expect(result.positiveReplies).toBe(4);
    expect(result.positiveReplyRate).toBe(20);
    expect(result.positiveOfReplies).toBe(66.7);
  });

  it("counts unsubscribes as opt-outs alongside suppression entries", () => {
    const result = computeOutreachStats(sent(50), [reply("UNSUBSCRIBE")], 2);
    expect(result.optOuts).toBe(3);
    expect(result.optOutRate).toBe(6);
  });

  it("returns zeros rather than NaN with no activity", () => {
    const result = computeOutreachStats([], []);
    expect(result).toMatchObject({
      sent: 0,
      replyRate: 0,
      bounceRate: 0,
      positiveOfReplies: 0,
    });
  });
});
