import { describe, expect, it } from "vitest";
import {
  ALL_STAGES,
  checkStageTransition,
  isContactableStage,
  isKnownStage,
  stageSideEffects,
} from "./stage-rules";

describe("isKnownStage", () => {
  it("accepts every stage the pipeline exposes", () => {
    for (const stage of ALL_STAGES) expect(isKnownStage(stage)).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isKnownStage("ALMOST_WON")).toBe(false);
    expect(isKnownStage("")).toBe(false);
  });
});

describe("isContactableStage", () => {
  it("treats forward pipeline stages as contactable", () => {
    expect(isContactableStage("QUALIFIED")).toBe(true);
    expect(isContactableStage("NEGOTIATION")).toBe(true);
    expect(isContactableStage("FOLLOW_UP_LATER")).toBe(true);
  });

  it("treats closed and suppressed stages as not contactable", () => {
    expect(isContactableStage("DO_NOT_CONTACT")).toBe(false);
    expect(isContactableStage("NOT_A_FIT")).toBe(false);
    expect(isContactableStage("LOST")).toBe(false);
    expect(isContactableStage("COLD")).toBe(false);
  });
});

describe("checkStageTransition", () => {
  it("allows an ordinary forward move", () => {
    expect(checkStageTransition({ from: "PROSPECT", to: "RESEARCHING" })).toEqual({
      ok: true,
    });
  });

  it("allows moving backwards", () => {
    expect(checkStageTransition({ from: "CONTACTED", to: "QUALIFIED" })).toEqual({
      ok: true,
    });
  });

  it("rejects an unknown target stage", () => {
    const result = checkStageTransition({ from: "PROSPECT", to: "MAYBE" });
    expect(result).toMatchObject({ ok: false, code: "unknown_stage" });
  });

  it("reports a move to the current stage as a no-op", () => {
    const result = checkStageTransition({ from: "QUALIFIED", to: "QUALIFIED" });
    expect(result).toMatchObject({ ok: false, code: "no_change" });
  });

  it("refuses to return a do-not-contact lead to a contactable stage", () => {
    for (const to of ["PROSPECT", "QUALIFIED", "CONTACTED", "WON", "FOLLOW_UP_LATER"]) {
      const result = checkStageTransition({ from: "DO_NOT_CONTACT", to });
      expect(result).toMatchObject({ ok: false, code: "do_not_contact" });
    }
  });

  it("still allows a do-not-contact lead to move to another closed stage", () => {
    expect(
      checkStageTransition({
        from: "DO_NOT_CONTACT",
        to: "NOT_A_FIT",
        reason: "Out of scope",
      }),
    ).toEqual({ ok: true });
    expect(checkStageTransition({ from: "DO_NOT_CONTACT", to: "COLD" })).toEqual({
      ok: true,
    });
  });

  it("requires a reason for lost and do-not-contact", () => {
    expect(checkStageTransition({ from: "NEGOTIATION", to: "LOST" })).toMatchObject({
      ok: false,
      code: "reason_required",
    });
    expect(
      checkStageTransition({ from: "NEGOTIATION", to: "LOST", reason: "   " }),
    ).toMatchObject({ ok: false, code: "reason_required" });
    expect(
      checkStageTransition({ from: "NEGOTIATION", to: "LOST", reason: "Chose a rival" }),
    ).toEqual({ ok: true });
    expect(
      checkStageTransition({ from: "CONTACTED", to: "DO_NOT_CONTACT" }),
    ).toMatchObject({ ok: false, code: "reason_required" });
  });
});

describe("stageSideEffects", () => {
  const now = new Date("2026-03-01T10:00:00Z");

  it("stamps wonAt and clears any earlier loss", () => {
    expect(stageSideEffects("WON", now)).toEqual({
      wonAt: now,
      lostAt: null,
      lostReason: null,
    });
  });

  it("stamps lostAt with the reason", () => {
    expect(stageSideEffects("LOST", now, " budget cut ")).toEqual({
      lostAt: now,
      lostReason: "budget cut",
      wonAt: null,
    });
  });

  it("treats not-a-fit as a loss for reporting", () => {
    expect(stageSideEffects("NOT_A_FIT", now, "Wrong industry")).toMatchObject({
      lostAt: now,
    });
  });

  it("leaves ordinary stages alone", () => {
    expect(stageSideEffects("QUALIFIED", now)).toEqual({});
  });
});
