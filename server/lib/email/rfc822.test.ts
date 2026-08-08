import { describe, expect, it } from "vitest";
import {
  bareAddress,
  buildRfc822,
  encodeHeaderWord,
  formatAddress,
  fromBase64Url,
  headerMap,
  sanitiseHeaderValue,
  toBase64Url,
} from "./rfc822";

const email = {
  to: "dana@acme.com",
  toName: "Dana Reyes",
  from: "bory@example.com",
  fromName: "Bory Umarov",
  subject: "Weekly reporting",
  body: "Hi Dana,\n\nQuick question.",
};

function decodeBody(raw: string) {
  const [, body] = raw.split("\r\n\r\n");
  return Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8");
}

describe("buildRfc822", () => {
  it("writes the standard headers and a base64 body", () => {
    const raw = buildRfc822(email);
    expect(raw).toContain('From: "Bory Umarov" <bory@example.com>');
    expect(raw).toContain('To: "Dana Reyes" <dana@acme.com>');
    expect(raw).toContain("Subject: Weekly reporting");
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(decodeBody(raw)).toBe(email.body);
  });

  it("adds threading headers when replying", () => {
    const raw = buildRfc822(
      { ...email, inReplyTo: "CAF123@mail.gmail.com" },
      { references: "<CAF000@mail.gmail.com>" },
    );
    expect(raw).toContain("In-Reply-To: <CAF123@mail.gmail.com>");
    expect(raw).toContain(
      "References: <CAF000@mail.gmail.com> <CAF123@mail.gmail.com>",
    );
  });

  it("cannot be used to inject extra headers through a display name", () => {
    const raw = buildRfc822({
      ...email,
      fromName: "Bory\r\nBcc: victim@example.com",
    });
    expect(raw).not.toContain("Bcc:");
    expect(raw.split("\r\n\r\n")[0].split("\r\n")).toHaveLength(6);
  });

  it("RFC 2047 encodes non-ASCII names and subjects", () => {
    const raw = buildRfc822({ ...email, subject: "Отчёт" });
    expect(raw).toContain("Subject: =?UTF-8?B?");
    expect(encodeHeaderWord("plain")).toBe("plain");
  });
});

describe("address helpers", () => {
  it("formats with and without a display name", () => {
    expect(formatAddress("a@b.com")).toBe("a@b.com");
    expect(formatAddress("a@b.com", "A B")).toBe('"A B" <a@b.com>');
  });

  it("extracts the bare address from a header value", () => {
    expect(bareAddress('"Dana Reyes" <Dana@Acme.com>')).toBe("dana@acme.com");
    expect(bareAddress("dana@acme.com")).toBe("dana@acme.com");
    expect(bareAddress(undefined)).toBe("");
  });

  it("strips CR/LF from header values", () => {
    expect(sanitiseHeaderValue("a\r\nb")).toBe("a b");
  });
});

describe("base64url", () => {
  it("round-trips", () => {
    expect(fromBase64Url(toBase64Url("hello ünicode"))).toBe("hello ünicode");
  });

  it("emits no padding or url-unsafe characters", () => {
    expect(toBase64Url("a".repeat(10))).not.toMatch(/[+/=]/);
  });
});

describe("headerMap", () => {
  it("lower-cases names and tolerates missing values", () => {
    expect(
      headerMap([
        { name: "Subject", value: "Hi" },
        { name: "From", value: null },
        { name: null, value: "x" },
      ]),
    ).toEqual({ subject: "Hi", from: "" });
  });
});
