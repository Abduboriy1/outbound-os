import { describe, expect, it } from "vitest";
import { detectSignals } from "~~/server/lib/research/signals";
import { UNCONSTRAINED_RATIO, UNKNOWN_RATIO, scoreFit, scoreLead, scoreOpportunity } from "./compute";
import { DEFAULT_WEIGHTS, parseWeights } from "~~/shared/scoring/weights";

const icp = {
  name: "Regional operators",
  industries: ["Logistics", "Wholesale"],
  geographies: ["United Kingdom"],
  targetRoles: ["Operations Manager", "Finance Director"],
  problems: ["manual reporting"],
  minEmployees: 20,
  maxEmployees: 250,
  minDealSize: 5_000,
  maxDealSize: 60_000,
};

const strongCompany = {
  name: "Acme Logistics",
  industry: "Logistics",
  location: "Leeds, United Kingdom",
  employeeCount: 80,
  description: "We supply commercial clients and handle manual reporting for our contracts.",
};

const painSignals = detectSignals([
  {
    id: "s1",
    label: "Careers",
    url: "https://acme.example/careers",
    text: [
      "We are hiring an Operations Coordinator to join our team.",
      "The weekly management report is produced in Excel by hand.",
      "Invoices are reconciled against statements each month.",
      "Order data is re-keyed into the finance system.",
      "Following rapid growth we opened a new depot.",
    ].join("\n"),
  },
]);

describe("scoreFit", () => {
  it("scores a textbook match near the top", () => {
    const result = scoreFit({
      icp,
      company: strongCompany,
      contacts: [{ title: "Operations Manager", decisionRole: "DECISION_MAKER" }],
      technologySignals: ["Excel", "Sage"],
    });
    expect(result.score).toBeGreaterThan(85);
    expect(result.factors.every((factor) => factor.points <= factor.max)).toBe(true);
  });

  it("scores a clear mismatch low", () => {
    const result = scoreFit({
      icp,
      company: {
        name: "Tiny Cafe",
        industry: "Hospitality",
        location: "Lisbon, Portugal",
        employeeCount: 3,
        description: "A consumer coffee shop for shoppers.",
      },
      contacts: [],
      technologySignals: [],
    });
    expect(result.score).toBeLessThan(35);
  });

  it("treats unknown data as unknown, not as a failure", () => {
    const unknown = scoreFit({
      icp,
      company: { name: "Mystery Ltd" },
      contacts: [],
      technologySignals: [],
    });
    const mismatch = scoreFit({
      icp,
      company: {
        name: "Wrong Ltd",
        industry: "Hospitality",
        location: "Lisbon, Portugal",
        employeeCount: 2,
      },
      contacts: [],
      technologySignals: [],
    });
    expect(unknown.score).toBeGreaterThan(mismatch.score);

    const industry = unknown.factors.find((factor) => factor.key === "industry")!;
    expect(industry.known).toBe(false);
    expect(industry.ratio).toBe(UNKNOWN_RATIO);
    expect(industry.rationale).toMatch(/not recorded/i);
  });

  it("neither credits nor penalises a factor the ICP does not constrain", () => {
    const result = scoreFit({
      icp: { name: "Anything goes" },
      company: strongCompany,
      contacts: [],
    });
    const geography = result.factors.find((factor) => factor.key === "geography")!;
    expect(geography.ratio).toBe(UNCONSTRAINED_RATIO);
    expect(geography.known).toBe(true);
  });

  it("gives partial credit just outside the size band", () => {
    const near = scoreFit({ icp, company: { ...strongCompany, employeeCount: 18 }, contacts: [] });
    const far = scoreFit({ icp, company: { ...strongCompany, employeeCount: 4000 }, contacts: [] });
    const nearSize = near.factors.find((f) => f.key === "size")!;
    const farSize = far.factors.find((f) => f.key === "size")!;
    expect(nearSize.ratio).toBeGreaterThan(farSize.ratio);
    expect(nearSize.ratio).toBeLessThan(1);
  });

  it("matches industry loosely in both directions", () => {
    const result = scoreFit({
      icp,
      company: { ...strongCompany, industry: "Freight and Logistics" },
      contacts: [],
    });
    expect(result.factors.find((f) => f.key === "industry")!.ratio).toBe(1);
  });

  it("gives every factor a rationale", () => {
    const result = scoreFit({ icp, company: strongCompany, contacts: [] });
    for (const factor of result.factors) {
      expect(factor.rationale.length).toBeGreaterThan(5);
    }
  });

  it("scores 0-100 whatever the inputs", () => {
    for (const employeeCount of [0, 1, 10_000_000]) {
      const result = scoreFit({ icp, company: { ...strongCompany, employeeCount }, contacts: [] });
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });
});

describe("scoreOpportunity", () => {
  it("rewards evidenced pain over an empty report", () => {
    const withEvidence = scoreOpportunity({
      company: strongCompany,
      signals: painSignals,
      contacts: [{ title: "Operations Manager", decisionRole: "DECISION_MAKER" }],
    });
    const withoutEvidence = scoreOpportunity({ company: strongCompany, signals: [], contacts: [] });
    expect(withEvidence.score).toBeGreaterThan(withoutEvidence.score);
    expect(withEvidence.score).toBeGreaterThan(60);
  });

  it("marks factors unknown when no research has run", () => {
    const result = scoreOpportunity({ company: strongCompany, signals: [] });
    const pain = result.factors.find((factor) => factor.key === "painSignals")!;
    expect(pain.known).toBe(false);
    expect(pain.rationale).toMatch(/no research/i);
  });

  it("scores a found decision maker above a bare contact", () => {
    const base = { company: strongCompany, signals: painSignals };
    const withDecisionMaker = scoreOpportunity({
      ...base,
      contacts: [{ title: "Ops Director", decisionRole: "DECISION_MAKER" }],
    });
    const withContact = scoreOpportunity({
      ...base,
      contacts: [{ title: "Assistant", decisionRole: "UNKNOWN" }],
    });
    const withNobody = scoreOpportunity({ ...base, contacts: [] });

    const ratio = (r: ReturnType<typeof scoreOpportunity>) =>
      r.factors.find((f) => f.key === "decisionMaker")!.ratio;
    expect(ratio(withDecisionMaker)).toBe(1);
    expect(ratio(withContact)).toBe(0.5);
    expect(ratio(withNobody)).toBe(0);
  });

  it("uses operator-supplied urgency when given", () => {
    const result = scoreOpportunity({ company: strongCompany, signals: painSignals, urgency: 1 });
    const urgency = result.factors.find((factor) => factor.key === "urgency")!;
    expect(urgency.ratio).toBe(1);
    expect(urgency.rationale).toMatch(/operator/i);
  });
});

describe("scoreLead", () => {
  it("blends the two scores 50/50 by default", () => {
    const result = scoreLead({
      icp,
      company: strongCompany,
      contacts: [{ title: "Operations Manager", decisionRole: "DECISION_MAKER" }],
      signals: painSignals,
      technologySignals: ["Excel"],
    });
    expect(result.overallScore).toBe(
      Math.round(result.fitScore * 0.5 + result.opportunityScore * 0.5),
    );
  });

  it("respects a retuned blend", () => {
    const input = {
      icp,
      company: strongCompany,
      contacts: [],
      signals: painSignals,
      technologySignals: ["Excel"],
    };
    const balanced = scoreLead(input, DEFAULT_WEIGHTS);
    const opportunityOnly = scoreLead(input, parseWeights({ blend: { fit: 0, opportunity: 1 } }));
    expect(opportunityOnly.overallScore).toBe(balanced.opportunityScore);
  });

  it("changes the fit score when a factor's weight is retuned", () => {
    const input = {
      icp,
      company: { ...strongCompany, industry: "Hospitality" },
      contacts: [],
      signals: painSignals,
    };
    const withDefaults = scoreLead(input);
    const industryIgnored = scoreLead(input, parseWeights({ fit: { industry: 0 } }));
    // Removing the weight of a badly-scoring factor must raise the score.
    expect(industryIgnored.fitScore).toBeGreaterThan(withDefaults.fitScore);
  });

  it("gives an industry-only ICP a fit score driven entirely by industry", () => {
    const onlyIndustry = parseWeights({
      fit: {
        industry: 100,
        size: 0,
        geography: 0,
        technology: 0,
        roleAvailability: 0,
        expectedBudget: 0,
        businessModel: 0,
      },
    });
    const match = scoreLead({ icp, company: strongCompany, contacts: [] }, onlyIndustry);
    const mismatch = scoreLead(
      { icp, company: { ...strongCompany, industry: "Hospitality" }, contacts: [] },
      onlyIndustry,
    );
    expect(match.fitScore).toBe(100);
    expect(mismatch.fitScore).toBe(10);
  });

  it("explains itself", () => {
    const result = scoreLead({
      icp,
      company: strongCompany,
      contacts: [],
      signals: painSignals,
    });
    expect(result.rationale).toContain("Acme Logistics");
    expect(result.rationale).toContain(String(result.overallScore));
  });

  it("is deterministic", () => {
    const input = { icp, company: strongCompany, contacts: [], signals: painSignals };
    expect(scoreLead(input)).toEqual(scoreLead(input));
  });

  it("never returns a score outside 0-100", () => {
    const result = scoreLead({
      icp,
      company: { name: "Empty" },
      contacts: [],
      signals: [],
    });
    for (const score of [result.fitScore, result.opportunityScore, result.overallScore]) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});
