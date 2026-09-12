import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  harvestEmails,
  harvestPhones,
  mergeDiscoveredPeople,
  nameFromEmail,
  syncDiscoveredPeople,
} from "./people";
import { prisma } from "~~/server/lib/db";

vi.mock("~~/server/lib/db", () => ({
  prisma: {
    contact: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const findMany = vi.mocked(prisma.contact.findMany);
const create = vi.mocked(prisma.contact.create);
const update = vi.mocked(prisma.contact.update);

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
  create.mockImplementation((({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: `c-${String(data.firstName).toLowerCase()}`,
      firstName: data.firstName,
      lastName: data.lastName ?? null,
      email: data.email ?? null,
    })) as never);
});

describe("harvestEmails", () => {
  it("finds addresses in page text, lowercased and deduplicated", () => {
    const found = harvestEmails([
      { url: "https://acme.example/contact", text: "Reach us at Info@Acme.example or jane.doe@acme.example." },
      { url: "https://acme.example/about", text: "info@acme.example again" },
    ]);
    expect(found).toEqual([
      { email: "info@acme.example", sourceUrl: "https://acme.example/contact" },
      { email: "jane.doe@acme.example", sourceUrl: "https://acme.example/contact" },
    ]);
  });

  it("ignores asset filenames that look like addresses", () => {
    const found = harvestEmails([
      { url: null, text: "background: url(hero@2x.png); write to sales@acme.example" },
    ]);
    expect(found.map((f) => f.email)).toEqual(["sales@acme.example"]);
  });
});

describe("harvestPhones", () => {
  it("finds labelled phone and fax numbers, like a contact page footer", () => {
    const found = harvestPhones([
      {
        url: "https://www.naw.org/contact",
        text: "Reach us — Tel: +1 (202) 872-0885 · Fax: (202) 785-0586 · 1325 G Street NW",
      },
    ]);
    expect(found).toEqual([
      { number: "+1 (202) 872-0885", kind: "phone", sourceUrl: "https://www.naw.org/contact" },
      { number: "(202) 785-0586", kind: "fax", sourceUrl: "https://www.naw.org/contact" },
    ]);
  });

  it("ignores digit runs with no telephone context", () => {
    const found = harvestPhones([
      { url: null, text: "Revenue grew from 1 200 000 to 1 500 000 last year." },
    ]);
    expect(found).toEqual([]);
  });

  it("deduplicates the same number across pages", () => {
    const found = harvestPhones([
      { url: "https://a.example", text: "Call 0113 496 0123 today" },
      { url: "https://b.example", text: "Phone: 0113 496 0123" },
    ]);
    expect(found).toHaveLength(1);
  });
});

describe("nameFromEmail", () => {
  it("title-cases the local part into first and last name", () => {
    expect(nameFromEmail("jane.doe@acme.example")).toEqual({
      firstName: "Jane",
      lastName: "Doe",
    });
  });

  it("keeps generic mailboxes as-is so they read as mailboxes", () => {
    expect(nameFromEmail("info@acme.example")).toEqual({
      firstName: "info",
      lastName: null,
    });
  });
});

describe("mergeDiscoveredPeople", () => {
  it("attaches a harvested email to the person it names", () => {
    const people = mergeDiscoveredPeople(
      [{ name: "Jane Doe", title: "COO", role: "DECISION_MAKER", email: null, source_url: null }],
      [{ email: "jane.doe@acme.example", sourceUrl: "https://acme.example/contact" }],
    );
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ name: "Jane Doe", email: "jane.doe@acme.example" });
  });

  it("keeps unmatched addresses as their own nameless entries", () => {
    const people = mergeDiscoveredPeople(
      [],
      [{ email: "info@acme.example", sourceUrl: null }],
    );
    expect(people).toEqual([
      { name: null, title: null, role: "UNKNOWN", email: "info@acme.example", sourceUrl: null },
    ]);
  });
});

describe("syncDiscoveredPeople", () => {
  const base = { userId: "u1", companyId: "co1" };

  it("creates a contact named from the email when only an email was found", async () => {
    const result = await syncDiscoveredPeople({
      ...base,
      people: [{ name: null, title: null, role: "UNKNOWN", email: "jane.doe@acme.example", sourceUrl: null }],
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firstName: "Jane",
          lastName: "Doe",
          email: "jane.doe@acme.example",
        }),
      }),
    );
    expect(result.created).toHaveLength(1);
  });

  it("matches an existing contact by email instead of duplicating", async () => {
    findMany.mockResolvedValue([
      { id: "c1", firstName: "Jane", lastName: "Doe", email: "jane.doe@acme.example", deletedAt: null },
    ] as never);

    const result = await syncDiscoveredPeople({
      ...base,
      people: [{ name: "Jane Doe", title: null, role: "UNKNOWN", email: "JANE.DOE@acme.example", sourceUrl: null }],
    });

    expect(create).not.toHaveBeenCalled();
    expect(result.matched).toBe(1);
  });

  it("enriches a name match that was missing its email", async () => {
    findMany.mockResolvedValue([
      { id: "c1", firstName: "Jane", lastName: "Doe", email: null, deletedAt: null },
    ] as never);

    const result = await syncDiscoveredPeople({
      ...base,
      people: [{ name: "Jane Doe", title: null, role: "UNKNOWN", email: "jane.doe@acme.example", sourceUrl: null }],
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { email: "jane.doe@acme.example" },
    });
    expect(result.enriched).toEqual([
      { id: "c1", name: "Jane Doe", email: "jane.doe@acme.example" },
    ]);
  });

  it("does not resurrect a soft-deleted contact", async () => {
    findMany.mockResolvedValue([
      { id: "c1", firstName: "Jane", lastName: "Doe", email: "jane.doe@acme.example", deletedAt: new Date() },
    ] as never);

    const result = await syncDiscoveredPeople({
      ...base,
      people: [{ name: "Jane Doe", title: null, role: "UNKNOWN", email: "jane.doe@acme.example", sourceUrl: null }],
    });

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(result.matched).toBe(1);
  });
});
