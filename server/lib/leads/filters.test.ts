import { describe, expect, it } from "vitest";
import {
  ACTIVE_LEAD_STAGES,
  buildCompanyOrderBy,
  buildCompanyWhere,
  buildContactWhere,
  buildLeadOrderBy,
  buildLeadWhere,
  buildTaskWhere,
  companyFiltersSchema,
  contactFiltersSchema,
  dueBucket,
  groupByDue,
  leadFiltersSchema,
  parseStages,
  splitList,
  taskFiltersSchema,
} from "./filters";

const USER = "user_1";

describe("splitList", () => {
  it("splits, trims and drops blanks", () => {
    expect(splitList(" a , b ,, c ")).toEqual(["a", "b", "c"]);
    expect(splitList(undefined)).toEqual([]);
    expect(splitList("")).toEqual([]);
  });
});

describe("parseStages", () => {
  it("keeps only valid stages", () => {
    expect(parseStages("QUALIFIED,NOPE,WON")).toEqual(["QUALIFIED", "WON"]);
  });
});

describe("companyFiltersSchema", () => {
  it("defaults to sorting by name ascending", () => {
    expect(companyFiltersSchema.parse({})).toEqual({ sort: "name", dir: "asc" });
  });

  it("falls back rather than throwing on a bad sort", () => {
    expect(companyFiltersSchema.parse({ sort: "bogus" }).sort).toBe("name");
  });

  it("treats a blank search box as no filter", () => {
    expect(companyFiltersSchema.parse({ q: "   " }).q).toBeUndefined();
  });
});

describe("buildCompanyWhere", () => {
  it("always scopes to the user and excludes soft-deleted rows", () => {
    const where = buildCompanyWhere(USER, companyFiltersSchema.parse({}));
    expect(where).toEqual({ userId: USER, deletedAt: null });
  });

  it("searches name, domain and location case-insensitively", () => {
    const where = buildCompanyWhere(USER, companyFiltersSchema.parse({ q: "acme" }));
    expect(where.OR).toEqual([
      { name: { contains: "acme", mode: "insensitive" } },
      { domain: { contains: "acme", mode: "insensitive" } },
      { location: { contains: "acme", mode: "insensitive" } },
    ]);
  });

  it("turns a size bucket into an employee-count range", () => {
    expect(
      buildCompanyWhere(USER, companyFiltersSchema.parse({ size: "11-50" }))
        .employeeCount,
    ).toEqual({ gte: 11, lte: 50 });
  });

  it("leaves the top bucket open ended", () => {
    expect(
      buildCompanyWhere(USER, companyFiltersSchema.parse({ size: "1001+" }))
        .employeeCount,
    ).toEqual({ gte: 1001 });
  });

  it("ignores an unrecognised bucket", () => {
    expect(
      buildCompanyWhere(USER, companyFiltersSchema.parse({ size: "huge" }))
        .employeeCount,
    ).toBeUndefined();
  });

  it("orders by the requested column", () => {
    expect(
      buildCompanyOrderBy(companyFiltersSchema.parse({ sort: "updated", dir: "desc" })),
    ).toEqual({ updatedAt: "desc" });
  });
});

describe("buildContactWhere", () => {
  it("scopes and filters by company and decision role", () => {
    const where = buildContactWhere(
      USER,
      contactFiltersSchema.parse({ companyId: "c1", decisionRole: "CHAMPION" }),
    );
    expect(where).toMatchObject({
      userId: USER,
      deletedAt: null,
      companyId: "c1",
      decisionRole: "CHAMPION",
    });
  });

  it("searches across the person and their company", () => {
    const where = buildContactWhere(USER, contactFiltersSchema.parse({ q: "dana" }));
    expect(where.OR).toContainEqual({
      company: { name: { contains: "dana", mode: "insensitive" } },
    });
  });
});

describe("buildLeadWhere", () => {
  const now = new Date("2026-05-10T12:00:00Z");

  it("scopes to the user and hides soft-deleted leads", () => {
    const where = buildLeadWhere(USER, leadFiltersSchema.parse({}), now);
    expect(where).toEqual({ userId: USER, deletedAt: null });
  });

  it("filters by a stage list", () => {
    const where = buildLeadWhere(
      USER,
      leadFiltersSchema.parse({ stage: "QUALIFIED,CONTACTED" }),
      now,
    );
    expect(where.stage).toEqual({ in: ["QUALIFIED", "CONTACTED"] });
  });

  it("filters by ICP, source and minimum score", () => {
    const where = buildLeadWhere(
      USER,
      leadFiltersSchema.parse({ icpId: "icp1", source: "REFERRAL", minScore: "70" }),
      now,
    );
    expect(where).toMatchObject({
      icpId: "icp1",
      sourceType: "REFERRAL",
      overallScore: { gte: 70 },
    });
  });

  it("ignores a nonsense score instead of failing the page", () => {
    expect(leadFiltersSchema.parse({ minScore: "abc" }).minScore).toBeUndefined();
  });

  it("restricts the active view to working stages", () => {
    const where = buildLeadWhere(USER, leadFiltersSchema.parse({ view: "active" }), now);
    expect(where.stage).toEqual({ in: ACTIVE_LEAD_STAGES });
  });

  it("lets an explicit stage filter win over the active view", () => {
    const where = buildLeadWhere(
      USER,
      leadFiltersSchema.parse({ view: "active", stage: "WON" }),
      now,
    );
    expect(where.stage).toEqual({ in: ["WON"] });
  });

  it("finds overdue next actions relative to the supplied clock", () => {
    const where = buildLeadWhere(USER, leadFiltersSchema.parse({ view: "overdue" }), now);
    expect(where.nextActionDueAt).toEqual({ lt: now });
  });

  it("finds active leads with no next action", () => {
    const where = buildLeadWhere(
      USER,
      leadFiltersSchema.parse({ view: "no-next-action" }),
      now,
    );
    expect(where.nextAction).toBeNull();
    expect(where.stage).toEqual({ in: ACTIVE_LEAD_STAGES });
  });

  it("finds unscored leads", () => {
    const where = buildLeadWhere(USER, leadFiltersSchema.parse({ view: "unscored" }), now);
    expect(where.overallScore).toBeNull();
  });
});

describe("buildLeadOrderBy", () => {
  it("sorts by overall score descending by default, nulls last", () => {
    expect(buildLeadOrderBy(leadFiltersSchema.parse({}))).toEqual([
      { overallScore: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ]);
  });

  it("supports value, due date and company sorts", () => {
    expect(buildLeadOrderBy(leadFiltersSchema.parse({ sort: "value", dir: "asc" }))).toEqual(
      [{ estimatedValueMax: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    );
    expect(buildLeadOrderBy(leadFiltersSchema.parse({ sort: "due", dir: "asc" }))[0]).toEqual(
      { nextActionDueAt: { sort: "asc", nulls: "last" } },
    );
    expect(buildLeadOrderBy(leadFiltersSchema.parse({ sort: "company", dir: "asc" }))).toEqual(
      [{ company: { name: "asc" } }],
    );
  });
});

describe("buildTaskWhere", () => {
  it("defaults to open tasks for the user", () => {
    expect(buildTaskWhere(USER, taskFiltersSchema.parse({}))).toEqual({
      userId: USER,
      status: "OPEN",
    });
  });

  it("drops the status clause for the ALL view", () => {
    expect(buildTaskWhere(USER, taskFiltersSchema.parse({ status: "ALL" }))).toEqual({
      userId: USER,
    });
  });
});

describe("dueBucket", () => {
  const now = new Date("2026-05-10T12:00:00");

  it("classifies a missing date as none", () => {
    expect(dueBucket(null, now)).toBe("none");
  });

  it("classifies yesterday as overdue", () => {
    expect(dueBucket(new Date("2026-05-09T23:59:00"), now)).toBe("overdue");
  });

  it("counts anything earlier today as today, not overdue", () => {
    expect(dueBucket(new Date("2026-05-10T00:00:00"), now)).toBe("today");
    expect(dueBucket(new Date("2026-05-10T23:59:00"), now)).toBe("today");
  });

  it("classifies tomorrow as upcoming", () => {
    expect(dueBucket(new Date("2026-05-11T00:01:00"), now)).toBe("upcoming");
  });
});

describe("groupByDue", () => {
  it("splits items into the four follow-up buckets", () => {
    const now = new Date("2026-05-10T12:00:00");
    const items = [
      { id: "a", dueAt: new Date("2026-05-01T09:00:00") },
      { id: "b", dueAt: new Date("2026-05-10T08:00:00") },
      { id: "c", dueAt: new Date("2026-06-01T09:00:00") },
      { id: "d", dueAt: null },
    ];
    const groups = groupByDue(items, (i) => i.dueAt, now);
    expect(groups.overdue.map((i) => i.id)).toEqual(["a"]);
    expect(groups.today.map((i) => i.id)).toEqual(["b"]);
    expect(groups.upcoming.map((i) => i.id)).toEqual(["c"]);
    expect(groups.none.map((i) => i.id)).toEqual(["d"]);
  });

  it("returns empty buckets rather than missing keys", () => {
    expect(groupByDue([], () => null)).toEqual({
      overdue: [],
      today: [],
      upcoming: [],
      none: [],
    });
  });
});
