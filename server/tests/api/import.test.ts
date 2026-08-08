import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_USER, call } from "../harness";

/**
 * `POST /api/import` is the one new route that is not a query — it writes, and
 * it exists specifically to restore three things the browser-side
 * `companies → contacts → leads` chain had lost. Each of the three is asserted
 * here, and the transaction is exercised with a mid-way failure against an
 * in-memory Prisma whose `$transaction` really does roll back.
 */

type Row = Record<string, unknown> & { id: string };

const db = {
  companies: [] as Row[],
  contacts: [] as Row[],
  leads: [] as Row[],
  stageHistory: [] as Row[],
  activities: [] as Row[],
};

let nextId = 0;
const id = () => `id_${++nextId}`;

/** Set to make `lead.create` throw once the nth lead is attempted. */
let failLeadCreateOn: number | null = null;
let leadCreateAttempts = 0;

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (expected === undefined) return true;
    return row[key] === expected;
  });
}

function table(rows: Row[], onCreate?: () => void) {
  return {
    findFirst: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) =>
      rows.find((row) => matches(row, where ?? {})) ?? null,
    ),
    findMany: vi.fn(async () => [...rows]),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      onCreate?.();
      const row = { id: id(), createdAt: new Date(), deletedAt: null, ...data } as Row;
      rows.push(row);
      return row;
    }),
  };
}

const prismaMock = {
  company: table(db.companies),
  contact: table(db.contacts),
  lead: table(db.leads, () => {
    leadCreateAttempts += 1;
    if (failLeadCreateOn === leadCreateAttempts) throw new Error("boom");
  }),
  leadStageHistory: table(db.stageHistory),
  activity: table(db.activities),
  /**
   * Restores every table if the callback throws, which is what makes the
   * "a failure part-way through leaves no orphan company" assertion meaningful.
   */
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const backup = Object.fromEntries(
      Object.entries(db).map(([key, rows]) => [key, [...rows]]),
    ) as Record<string, Row[]>;
    try {
      return await fn(prismaMock);
    } catch (error) {
      for (const [key, rows] of Object.entries(db)) {
        rows.length = 0;
        rows.push(...backup[key]!);
      }
      throw error;
    }
  }),
};

const auditMock = vi.fn(async () => {});

class UnauthorizedError extends Error {}
let session: typeof TEST_USER | null = TEST_USER;

vi.mock("~~/server/lib/db", () => ({ prisma: prismaMock }));
vi.mock("~~/server/lib/audit", () => ({ audit: auditMock }));
vi.mock("~~/server/lib/auth", () => ({
  UnauthorizedError,
  requireUser: async () => {
    if (!session) throw new UnauthorizedError();
    return session;
  },
}));

const importPost = (await import("../../api/import/index.post")).default;

const ACME = {
  companyName: "Acme Logistics",
  domain: "acme.com",
  website: "https://www.acme.com",
  industry: "Logistics",
  contactFirstName: "Jo",
  contactLastName: "Rivera",
  contactEmail: "jo@acme.com",
  sourceDetail: "Q3 list",
};

const BOLT = {
  companyName: "Bolt Freight",
  domain: "bolt-freight.io",
  contactFirstName: "Sam",
  contactEmail: "sam@bolt-freight.io",
};

beforeEach(() => {
  session = TEST_USER;
  failLeadCreateOn = null;
  leadCreateAttempts = 0;
  for (const rows of Object.values(db)) rows.length = 0;
  vi.clearAllMocks();
});

describe("POST /api/import", () => {
  it("creates company, contact, lead, stage history and activity for each lead", async () => {
    const res = await call(importPost, { body: { leads: [ACME, BOLT] } });

    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ created: 2, skipped: 0 });
    expect(db.companies).toHaveLength(2);
    expect(db.contacts).toHaveLength(2);
    expect(db.leads).toHaveLength(2);

    expect(db.leads[0]).toMatchObject({
      userId: TEST_USER.id,
      stage: "PROSPECT",
      sourceType: "CSV",
      sourceDetail: "Q3 list",
      nextAction: "Research this company",
    });
  });

  it("writes the source's stage-history reason, not `Lead created`", async () => {
    await call(importPost, { body: { leads: [ACME] } });

    expect(db.stageHistory).toHaveLength(1);
    expect(db.stageHistory[0]).toMatchObject({
      newStage: "PROSPECT",
      reason: "Imported via CSV",
      actorType: "HUMAN",
    });
  });

  it("writes a LEAD_IMPORTED activity, not LEAD_CREATED", async () => {
    await call(importPost, { body: { leads: [ACME] } });

    expect(db.activities).toHaveLength(1);
    expect(db.activities[0]).toMatchObject({
      type: "LEAD_IMPORTED",
      summary: "Imported Acme Logistics",
      detail: "Q3 list",
    });
  });

  it("writes the leads.imported audit row with the counts", async () => {
    await call(importPost, { body: { leads: [ACME, BOLT] } });

    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: TEST_USER.id,
        action: "leads.imported",
        entityType: "Lead",
        metadata: { sourceType: "CSV", created: 2, skipped: 0 },
      }),
    );
  });

  it("carries the source type into the reason and the audit row", async () => {
    await call(importPost, { body: { leads: [ACME], sourceType: "MANUAL" } });

    expect(db.stageHistory[0]).toMatchObject({ reason: "Imported via MANUAL" });
    expect(db.leads[0]).toMatchObject({ sourceType: "MANUAL" });
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: db.leads[0]!.id,
        metadata: expect.objectContaining({ sourceType: "MANUAL" }),
      }),
    );
  });

  it("re-runs the dedupe server-side against live rows", async () => {
    db.companies.push({
      id: "existing",
      userId: TEST_USER.id,
      domain: "bolt-freight.io",
      name: "Bolt Freight",
      deletedAt: null,
    });

    const res = await call(importPost, { body: { leads: [ACME, BOLT] } });

    expect(res.data).toMatchObject({ created: 1, skipped: 1 });
    expect(res.data).toMatchObject({
      duplicates: [expect.objectContaining({ index: 1, matched: "Bolt Freight" })],
    });
    expect(db.leads).toHaveLength(1);
  });

  it("rolls back everything a failed lead had already written", async () => {
    // The second lead's `lead.create` throws after its company and contact rows
    // exist inside the transaction — the case that used to leave an orphan.
    failLeadCreateOn = 2;

    const res = await call(importPost, { body: { leads: [ACME, BOLT] } });

    expect(res.status).toBe(500);
    expect(res.error).toBe("Internal server error");

    // The first lead committed; the second left nothing behind at all.
    expect(db.companies).toHaveLength(1);
    expect(db.companies[0]).toMatchObject({ name: "Acme Logistics" });
    expect(db.contacts).toHaveLength(1);
    expect(db.leads).toHaveLength(1);
    expect(db.stageHistory).toHaveLength(1);
    expect(db.activities).toHaveLength(1);
  });

  it("does every write inside the transaction", async () => {
    await call(importPost, { body: { leads: [ACME] } });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("422s with the source's message when nothing is importable", async () => {
    const res = await call(importPost, { body: { leads: [] } });

    expect(res.status).toBe(422);
    expect(res.error).toBe("Nothing valid to import");
    expect(db.leads).toHaveLength(0);
  });

  it("422s on a row the source's discoveredSchema would reject", async () => {
    const res = await call(importPost, { body: { leads: [{ companyName: "" }] } });
    expect(res.status).toBe(422);
    expect(res.error).toBe("Nothing valid to import");
  });

  it("422s on an unknown source type", async () => {
    const res = await call(importPost, {
      body: { leads: [ACME], sourceType: "TELEPATHY" },
    });
    expect(res.status).toBe(422);
    expect(res.error).toBe("Validation failed");
  });

  it("401s without a session", async () => {
    session = null;
    const res = await call(importPost, { body: { leads: [ACME] } });
    expect(res.status).toBe(401);
    expect(res.error).toBe("Not authenticated");
    expect(db.leads).toHaveLength(0);
  });
});
