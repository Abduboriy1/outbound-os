import { describe, expect, it } from "vitest";
import {
  DEFAULT_BLEND,
  DEFAULT_FIT_WEIGHTS,
  DEFAULT_OPPORTUNITY_WEIGHTS,
  parseWeights,
} from "./weights";

describe("parseWeights", () => {
  it("returns the defaults for null, undefined, and junk", () => {
    for (const input of [null, undefined, 42, "weights", [], { nothing: true }]) {
      const weights = parseWeights(input);
      expect(weights.fit).toEqual(DEFAULT_FIT_WEIGHTS);
      expect(weights.opportunity).toEqual(DEFAULT_OPPORTUNITY_WEIGHTS);
      expect(weights.blend).toEqual(DEFAULT_BLEND);
    }
  });

  it("accepts the nested shape and merges per key", () => {
    const weights = parseWeights({ fit: { industry: 50 }, opportunity: { painSignals: 60 } });
    expect(weights.fit.industry).toBe(50);
    expect(weights.fit.size).toBe(DEFAULT_FIT_WEIGHTS.size);
    expect(weights.opportunity.painSignals).toBe(60);
    expect(weights.opportunity.hiring).toBe(DEFAULT_OPPORTUNITY_WEIGHTS.hiring);
  });

  it("accepts a flat map, because hand-edited JSON will be flat", () => {
    const weights = parseWeights({ industry: 40, painSignals: 10 });
    expect(weights.fit.industry).toBe(40);
    expect(weights.opportunity.painSignals).toBe(10);
  });

  it("coerces numeric strings", () => {
    expect(parseWeights({ fit: { industry: "30" } }).fit.industry).toBe(30);
  });

  it("ignores negative, non-finite, and non-numeric values", () => {
    const weights = parseWeights({
      fit: { industry: -5, size: Number.NaN, geography: "abc", technology: null },
    });
    expect(weights.fit.industry).toBe(DEFAULT_FIT_WEIGHTS.industry);
    expect(weights.fit.size).toBe(DEFAULT_FIT_WEIGHTS.size);
    expect(weights.fit.geography).toBe(DEFAULT_FIT_WEIGHTS.geography);
    expect(weights.fit.technology).toBe(DEFAULT_FIT_WEIGHTS.technology);
  });

  it("ignores unknown keys", () => {
    const weights = parseWeights({ fit: { vibes: 100 } });
    expect(weights.fit).toEqual(DEFAULT_FIT_WEIGHTS);
  });

  it("allows a single factor to be zeroed out", () => {
    expect(parseWeights({ fit: { geography: 0 } }).fit.geography).toBe(0);
  });

  it("falls back when every weight is zero, which would make all scores zero", () => {
    const weights = parseWeights({
      fit: Object.fromEntries(Object.keys(DEFAULT_FIT_WEIGHTS).map((key) => [key, 0])),
    });
    expect(weights.fit).toEqual(DEFAULT_FIT_WEIGHTS);
  });

  it("normalises the blend so it always sums to 1", () => {
    const weights = parseWeights({ blend: { fit: 3, opportunity: 1 } });
    expect(weights.blend.fit).toBeCloseTo(0.75);
    expect(weights.blend.opportunity).toBeCloseTo(0.25);
  });

  it("supports an opportunity-only blend", () => {
    const weights = parseWeights({ blend: { fit: 0, opportunity: 1 } });
    expect(weights.blend).toEqual({ fit: 0, opportunity: 1 });
  });
});
