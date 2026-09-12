import { describe, expect, it } from "vitest";
import { kindForPath, scoreLink } from "./crawl";
import { extractLinks } from "./search/text";

describe("scoreLink", () => {
  const host = "www.naw.org";

  it("puts people pages ahead of everything else", () => {
    expect(scoreLink({ url: "https://www.naw.org/team/", label: "Team" }, host)).toBe(2);
    expect(
      scoreLink({ url: "https://www.naw.org/who-we-are", label: "" }, host),
    ).toBe(2);
    expect(scoreLink({ url: "https://www.naw.org/about", label: "About" }, host)).toBe(1);
  });

  it("recognises a people link by its label when the path says nothing", () => {
    expect(
      scoreLink({ url: "https://www.naw.org/x9f2", label: "Meet the Board" }, host),
    ).toBe(2);
  });

  it("never follows offsite links or binary files", () => {
    expect(scoreLink({ url: "https://twitter.com/naw", label: "Team" }, host)).toBe(0);
    expect(
      scoreLink({ url: "https://www.naw.org/team/roster.pdf", label: "Team roster" }, host),
    ).toBe(0);
  });

  it("ignores links with no relevance signal", () => {
    expect(scoreLink({ url: "https://www.naw.org/privacy", label: "Privacy" }, host)).toBe(0);
  });
});

describe("kindForPath", () => {
  it("classifies team and contact pages as their own kinds", () => {
    expect(kindForPath("/team")).toBe("TEAM");
    expect(kindForPath("Meet the Board /x9f2")).toBe("TEAM");
    expect(kindForPath("/contact-us")).toBe("CONTACT");
    expect(kindForPath("/about")).toBe("ABOUT");
  });
});

describe("extractLinks", () => {
  it("resolves relative hrefs and keeps the anchor text as the label", () => {
    const html = `
      <nav><a href="/team/">Our <b>Team</b></a>
      <a href="https://example.org/x">Offsite</a>
      <a href="#section">Skip</a>
      <a href="mailto:info@naw.org">Email</a></nav>`;
    const links = extractLinks(html, "https://www.naw.org/");
    expect(links).toEqual([
      { url: "https://www.naw.org/team/", label: "Our Team" },
      { url: "https://example.org/x", label: "Offsite" },
    ]);
  });

  it("falls back to aria-label for icon links and deduplicates", () => {
    const html = `
      <a href="/contact" aria-label="Contact us"><svg></svg></a>
      <a href="/contact">Contact</a>`;
    const links = extractLinks(html, "https://www.naw.org");
    expect(links).toEqual([{ url: "https://www.naw.org/contact", label: "Contact us" }]);
  });
});
