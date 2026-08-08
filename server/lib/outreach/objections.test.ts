import { describe, expect, it } from "vitest";
import {
  OBJECTIONS,
  getObjection,
  matchObjection,
  matchObjections,
  objectionPlaybook,
} from "~~/shared/outreach/objections";
import { OUTREACH_TEMPLATES, fillTemplate, findPlaceholders } from "~~/shared/outreach/templates";

describe("objection library", () => {
  it("covers every objection named in the plan", () => {
    expect(OBJECTIONS.map((objection) => objection.key)).toEqual([
      "TOO_EXPENSIVE",
      "NEED_TO_THINK",
      "ALREADY_HAVE_SOFTWARE",
      "BUILD_INTERNALLY",
      "NOT_A_PRIORITY",
      "SEND_INFORMATION",
      "NO_BUDGET",
    ]);
  });

  it("leads with understanding rather than a rebuttal", () => {
    for (const objection of OBJECTIONS) {
      expect(objection.understandFirst.length).toBeGreaterThan(0);
      expect(objection.avoid.length).toBeGreaterThan(0);
      expect(objection.legitimateWhen.length).toBeGreaterThan(0);
      for (const question of objection.understandFirst) {
        expect(question).toMatch(/\?$/);
      }
    }
  });

  const cases: [string, string][] = [
    ["That is too expensive for us.", "TOO_EXPENSIVE"],
    ["I need to think about it.", "NEED_TO_THINK"],
    ["We already have software for that.", "ALREADY_HAVE_SOFTWARE"],
    ["Our in-house team could build this.", "BUILD_INTERNALLY"],
    ["It is not a priority this quarter.", "NOT_A_PRIORITY"],
    ["Send me some more information.", "SEND_INFORMATION"],
    ["There is no budget for it.", "NO_BUDGET"],
  ];

  for (const [text, key] of cases) {
    it(`matches "${text}" to ${key}`, () => {
      expect(matchObjection(text)?.key).toBe(key);
    });
  }

  it("returns every objection present in a longer reply", () => {
    const keys = matchObjections(
      "No budget this year, and honestly we already have software for it.",
    ).map((objection) => objection.key);
    expect(keys).toEqual(
      expect.arrayContaining(["NO_BUDGET", "ALREADY_HAVE_SOFTWARE"]),
    );
  });

  it("returns nothing for neutral text", () => {
    expect(matchObjections("Sounds useful, can we speak Thursday?")).toEqual([]);
    expect(matchObjection(null)).toBeNull();
  });

  it("looks up by key and rejects unknown keys", () => {
    expect(getObjection("NO_BUDGET")?.label).toBe("No budget");
    expect(getObjection("MADE_UP")).toBeNull();
  });

  it("hands the agent a compact playbook with the avoid list attached", () => {
    const playbook = objectionPlaybook();
    expect(playbook).toHaveLength(OBJECTIONS.length);
    for (const entry of playbook) {
      expect(entry.guidance).toContain("Avoid:");
      expect(entry.understandFirst.length).toBeGreaterThan(0);
    }
  });
});

describe("templates", () => {
  it("provides a starter for every outreach variant", () => {
    const variants = new Set(OUTREACH_TEMPLATES.map((template) => template.variant));
    expect(variants).toEqual(
      new Set(["EMAIL", "SHORT", "LINKEDIN_DM", "FOLLOW_UP", "REFERRAL_INTRO"]),
    );
  });

  it("gives the DM template no subject line", () => {
    const dm = OUTREACH_TEMPLATES.find((t) => t.variant === "LINKEDIN_DM");
    expect(dm?.subject).toBeNull();
  });

  it("finds unfilled placeholders so approval can block them", () => {
    for (const template of OUTREACH_TEMPLATES) {
      expect(findPlaceholders(template.body).length).toBeGreaterThan(0);
    }
    expect(findPlaceholders("Hi Dana, no placeholders here.")).toEqual([]);
  });

  it("fills placeholders and leaves unknown ones visible", () => {
    const filled = fillTemplate("Hi {{firstName}} at {{company}}", {
      firstName: "Dana",
    });
    expect(filled).toBe("Hi Dana at {{company}}");
    expect(findPlaceholders(filled)).toEqual(["{{company}}"]);
  });
});
