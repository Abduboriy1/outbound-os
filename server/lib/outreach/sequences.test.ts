import { describe, expect, it } from "vitest";
import {
  dueAt,
  dueStep,
  evaluatePause,
  isComplete,
  nextRunAtFor,
  orderedSteps,
  variantForStep,
  type EnrollmentSignals,
  type StepLike,
} from "./sequences";

function signals(overrides: Partial<EnrollmentSignals> = {}): EnrollmentSignals {
  return {
    status: "ACTIVE",
    hasInboundReply: false,
    hasBounce: false,
    optedOut: false,
    suppressed: false,
    leadStage: "CONTACTED",
    hasContactEmail: true,
    ...overrides,
  };
}

describe("evaluatePause", () => {
  it("keeps running when nothing has happened", () => {
    expect(evaluatePause(signals())).toEqual({ paused: false });
  });

  it("pauses immediately when the prospect replies", () => {
    const decision = evaluatePause(signals({ hasInboundReply: true }));
    expect(decision).toMatchObject({ paused: true, reason: "REPLIED" });
  });

  it("pauses immediately when a message bounces", () => {
    expect(evaluatePause(signals({ hasBounce: true }))).toMatchObject({
      paused: true,
      reason: "BOUNCED",
    });
  });

  it("pauses immediately when the prospect opts out", () => {
    expect(evaluatePause(signals({ optedOut: true }))).toMatchObject({
      paused: true,
      reason: "OPTED_OUT",
    });
  });

  it("pauses immediately when paused by hand", () => {
    expect(evaluatePause(signals({ manuallyPaused: true }))).toMatchObject({
      paused: true,
      reason: "MANUAL",
    });
  });

  it("pauses when the address reaches the suppression list by any route", () => {
    expect(evaluatePause(signals({ suppressed: true }))).toMatchObject({
      paused: true,
      reason: "SUPPRESSED",
    });
  });

  it("pauses when the lead is marked do-not-contact or not a fit", () => {
    expect(evaluatePause(signals({ leadStage: "DO_NOT_CONTACT" }))).toMatchObject({
      paused: true,
      reason: "UNCONTACTABLE_STAGE",
    });
    expect(evaluatePause(signals({ leadStage: "NOT_A_FIT" }))).toMatchObject({
      paused: true,
      reason: "UNCONTACTABLE_STAGE",
    });
  });

  it("pauses when there is nobody to write to", () => {
    expect(evaluatePause(signals({ hasContactEmail: false }))).toMatchObject({
      paused: true,
      reason: "NO_CONTACT_EMAIL",
    });
  });

  it("prefers the manual reason when a human pressed pause", () => {
    const decision = evaluatePause(
      signals({ manuallyPaused: true, hasInboundReply: true }),
    );
    expect(decision).toMatchObject({ reason: "MANUAL" });
  });

  it("reports opt-out ahead of a reply, since it has compliance consequences", () => {
    expect(
      evaluatePause(signals({ optedOut: true, hasInboundReply: true })),
    ).toMatchObject({ reason: "OPTED_OUT" });
  });

  it("carries a human-readable explanation for the activity log", () => {
    const decision = evaluatePause(signals({ hasBounce: true }));
    expect(decision.paused && decision.message).toMatch(/bounced/i);
  });
});

describe("step scheduling", () => {
  const steps: StepLike[] = [
    { id: "s3", dayOffset: 10, purpose: "Useful observation", channel: "EMAIL" },
    { id: "s1", dayOffset: 0, purpose: "Initial message", channel: "EMAIL" },
    { id: "s2", dayOffset: 4, purpose: "Short follow-up", channel: "EMAIL" },
    { id: "s4", dayOffset: 20, purpose: "Final follow-up", channel: "EMAIL" },
  ];

  const enrolledAt = new Date("2026-08-01T09:00:00Z");

  it("orders steps by day offset regardless of insertion order", () => {
    expect(orderedSteps(steps).map((step) => step.id)).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
    ]);
  });

  it("returns the first step immediately on enrolment", () => {
    expect(
      dueStep({ steps, currentStep: 0, enrolledAt, now: enrolledAt })?.id,
    ).toBe("s1");
  });

  it("does not return a step before its day offset", () => {
    expect(
      dueStep({
        steps,
        currentStep: 1,
        enrolledAt,
        now: new Date("2026-08-03T09:00:00Z"),
      }),
    ).toBeNull();
  });

  it("returns the step once its day offset has passed", () => {
    expect(
      dueStep({
        steps,
        currentStep: 1,
        enrolledAt,
        now: new Date("2026-08-05T09:00:00Z"),
      })?.id,
    ).toBe("s2");
  });

  it("returns null once every step has been generated", () => {
    expect(
      dueStep({
        steps,
        currentStep: 4,
        enrolledAt,
        now: new Date("2027-01-01T00:00:00Z"),
      }),
    ).toBeNull();
    expect(isComplete(steps.length, 4)).toBe(true);
    expect(isComplete(steps.length, 3)).toBe(false);
  });

  it("computes the next run time from the enrolment date", () => {
    expect(nextRunAtFor(steps, 1, enrolledAt)?.toISOString()).toBe(
      dueAt(enrolledAt, 4).toISOString(),
    );
    expect(nextRunAtFor(steps, 4, enrolledAt)).toBeNull();
  });
});

describe("variantForStep", () => {
  it("opens with a first-contact email and follows up afterwards", () => {
    const step: StepLike = { id: "s", dayOffset: 0, purpose: "x", channel: "EMAIL" };
    expect(variantForStep(step, 0)).toBe("EMAIL");
    expect(variantForStep(step, 1)).toBe("FOLLOW_UP");
  });

  it("uses the DM variant for LinkedIn steps", () => {
    expect(
      variantForStep({ id: "s", dayOffset: 0, purpose: "x", channel: "LINKEDIN" }, 2),
    ).toBe("LINKEDIN_DM");
  });
});
