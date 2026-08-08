import { describe, expect, it } from "vitest";
import { CSVProvider, mapRows, missingRequiredFields, parseCsv } from "./csv";
import { guessMapping } from "./fields";
import { ManualProvider, manualLeadSchema, toDiscoveredLead } from "./manual";

const SAMPLE = `Company Name,Website,Industry,Employees,First Name,Last Name,Job Title,Email
Acme Logistics,https://www.acme.com,Logistics,120,Jo,Rivera,COO,jo@acme.com
Bolt Freight,bolt-freight.io,Trucking,"1,200",Sam,Diaz,VP Operations,sam@bolt-freight.io
`;

describe("parseCsv", () => {
  it("splits the header row from the data rows", () => {
    const parsed = parseCsv(SAMPLE);
    expect(parsed.headers).toEqual([
      "Company Name",
      "Website",
      "Industry",
      "Employees",
      "First Name",
      "Last Name",
      "Job Title",
      "Email",
    ]);
    expect(parsed.rows).toHaveLength(2);
  });

  it("keeps quoted values containing commas intact", () => {
    expect(parseCsv(SAMPLE).rows[1][3]).toBe("1,200");
  });

  it("drops blank lines", () => {
    const parsed = parseCsv("a,b\n\n1,2\n\n\n");
    expect(parsed.rows).toEqual([["1", "2"]]);
  });

  it("returns empty structures for empty input", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [], errors: [] });
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n").rows).toEqual([["1", "2"]]);
  });
});

describe("guessMapping", () => {
  it("matches common header spellings", () => {
    const mapping = guessMapping(parseCsv(SAMPLE).headers);
    expect(mapping).toMatchObject({
      companyName: 0,
      website: 1,
      industry: 2,
      employeeCount: 3,
      contactFirstName: 4,
      contactLastName: 5,
      contactTitle: 6,
      contactEmail: 7,
    });
  });

  it("prefers an exact synonym over a substring match", () => {
    const mapping = guessMapping(["Name", "Company Name"]);
    expect(mapping.companyName).toBe(1);
  });

  it("never assigns one column to two fields", () => {
    const mapping = guessMapping(["company_name", "email"]);
    const used = Object.values(mapping);
    expect(new Set(used).size).toBe(used.length);
  });

  it("leaves fields unmapped when nothing matches", () => {
    expect(guessMapping(["col1", "col2"]).companyName).toBeUndefined();
  });
});

describe("mapRows", () => {
  const parsed = parseCsv(SAMPLE);
  const mapping = guessMapping(parsed.headers);

  it("builds discovered leads from mapped columns", () => {
    const { leads } = mapRows(parsed.rows, mapping);
    expect(leads[0]).toMatchObject({
      companyName: "Acme Logistics",
      domain: "acme.com",
      industry: "Logistics",
      employeeCount: 120,
      contactFirstName: "Jo",
      contactTitle: "COO",
      contactEmail: "jo@acme.com",
    });
  });

  it("derives the domain when only a website is given", () => {
    const { leads } = mapRows(parsed.rows, mapping);
    expect(leads[1].domain).toBe("bolt-freight.io");
    expect(leads[1].employeeCount).toBe(1200);
  });

  it("derives the domain from the contact email as a last resort", () => {
    const { leads } = mapRows([["Acme", "jo@acme.com"]], {
      companyName: 0,
      contactEmail: 1,
    });
    expect(leads[0].domain).toBe("acme.com");
    expect(leads[0].website).toBe("https://acme.com");
  });

  it("skips rows with no company name and reports why", () => {
    const result = mapRows([["", "jo@acme.com"], ["Acme", "jo@acme.com"]], {
      companyName: 0,
      contactEmail: 1,
    });
    expect(result.leads).toHaveLength(1);
    expect(result.skipped).toBe(1);
    expect(result.issues[0]).toMatchObject({ row: 2, field: "companyName" });
  });

  it("drops an unreadable email but keeps the row", () => {
    const result = mapRows([["Acme", "not-an-email"]], {
      companyName: 0,
      contactEmail: 1,
    });
    expect(result.leads[0].contactEmail).toBeUndefined();
    expect(result.issues[0].message).toContain("not-an-email");
  });

  it("drops an unreadable headcount but keeps the row", () => {
    const result = mapRows([["Acme", "loads"]], {
      companyName: 0,
      employeeCount: 1,
    });
    expect(result.leads[0].employeeCount).toBeUndefined();
    expect(result.issues[0].field).toBe("employeeCount");
  });

  it("numbers issues the way a spreadsheet does", () => {
    const result = mapRows([["A"], [""], ["C"]], { companyName: 0 });
    expect(result.issues[0].row).toBe(3);
  });

  it("records where each lead came from", () => {
    expect(mapRows(parsed.rows, mapping).leads[0].sourceDetail).toBe("CSV row 2");
  });
});

describe("missingRequiredFields", () => {
  it("flags an unmapped company name", () => {
    expect(missingRequiredFields({ contactEmail: 1 })).toEqual(["companyName"]);
  });

  it("passes once the company name is mapped", () => {
    expect(missingRequiredFields({ companyName: 0 })).toEqual([]);
  });
});

describe("CSVProvider", () => {
  it("implements the LeadProvider contract", async () => {
    const provider = new CSVProvider();
    expect(provider.kind).toBe("csv");
    const leads = await provider.discover({ text: SAMPLE });
    expect(leads).toHaveLength(2);
    expect(leads[0].companyName).toBe("Acme Logistics");
  });

  it("returns nothing for empty input", async () => {
    expect(await new CSVProvider().discover({ text: "  " })).toEqual([]);
  });
});

describe("ManualProvider", () => {
  it("requires a company name", () => {
    expect(() => manualLeadSchema.parse({ companyName: "" })).toThrow();
  });

  it("normalises what it is given", () => {
    const lead = toDiscoveredLead(
      manualLeadSchema.parse({
        companyName: "  Acme Logistics ",
        website: "https://WWW.acme.com/about",
        contactEmail: " JO@ACME.COM ",
      }),
    );
    expect(lead).toMatchObject({
      companyName: "Acme Logistics",
      domain: "acme.com",
      contactEmail: "jo@acme.com",
      sourceDetail: "Manual entry",
    });
  });

  it("coerces a numeric headcount from a form string", () => {
    const lead = toDiscoveredLead(
      manualLeadSchema.parse({ companyName: "Acme", employeeCount: "120" }),
    );
    expect(lead.employeeCount).toBe(120);
  });

  it("accepts a single object or an array", async () => {
    const provider = new ManualProvider();
    expect(provider.kind).toBe("manual");
    expect(await provider.discover({ companyName: "Acme" })).toHaveLength(1);
    expect(
      await provider.discover([{ companyName: "Acme" }, { companyName: "Bolt" }]),
    ).toHaveLength(2);
  });
});
