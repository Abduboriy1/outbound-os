/**
 * Minimal RFC 822 / MIME serialisation for Gmail's `users.messages.send`,
 * which takes a base64url-encoded raw message rather than structured fields.
 *
 * Pure and dependency-free so it can be unit tested without the API client.
 */

import type { OutgoingEmail } from "~~/server/lib/contracts";

export type Rfc822Options = {
  /** Message-ID of the message being replied to, used for threading. */
  inReplyTo?: string;
  /** Accumulated References header of the thread. */
  references?: string;
};

/**
 * Encodes a display name safely. Non-ASCII names must be RFC 2047 encoded or
 * Gmail rejects the message.
 */
export function encodeHeaderWord(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export function formatAddress(email: string, name?: string): string {
  const address = email.trim();
  if (!name?.trim()) return address;
  const encoded = encodeHeaderWord(name.trim());
  // Quote the phrase unless it was already RFC 2047 encoded.
  const phrase = encoded.startsWith("=?") ? encoded : `"${encoded.replace(/"/g, "")}"`;
  return `${phrase} <${address}>`;
}

/** Strips CR/LF from a header value so a crafted name cannot inject headers. */
export function sanitiseHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function buildRfc822(
  email: OutgoingEmail,
  options: Rfc822Options = {},
): string {
  const headers: [string, string][] = [
    ["From", formatAddress(email.from, email.fromName)],
    ["To", formatAddress(email.to, email.toName)],
    ["Subject", encodeHeaderWord(email.subject)],
    ["MIME-Version", "1.0"],
    ["Content-Type", 'text/plain; charset="UTF-8"'],
    ["Content-Transfer-Encoding", "base64"],
  ];

  const inReplyTo = options.inReplyTo ?? email.inReplyTo;
  if (inReplyTo) {
    const id = bracket(inReplyTo);
    headers.push(["In-Reply-To", id]);
    headers.push([
      "References",
      options.references ? `${options.references} ${id}` : id,
    ]);
  }

  const head = headers
    .map(([name, value]) => `${name}: ${sanitiseHeaderValue(value)}`)
    .join("\r\n");

  // Base64 body avoids every quoted-printable and line-length pitfall.
  const body = wrap(Buffer.from(email.body, "utf8").toString("base64"), 76);
  return `${head}\r\n\r\n${body}`;
}

function bracket(id: string): string {
  const trimmed = id.trim();
  return trimmed.startsWith("<") ? trimmed : `<${trimmed}>`;
}

function wrap(value: string, width: number): string {
  const out: string[] = [];
  for (let i = 0; i < value.length; i += width) {
    out.push(value.slice(i, i + width));
  }
  return out.join("\r\n");
}

export function toBase64Url(raw: string): string {
  return Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/* ------------------------------------------------------------- decoding */

export function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

export type ParsedHeaders = Record<string, string>;

export function headerMap(
  headers: { name?: string | null; value?: string | null }[] | undefined,
): ParsedHeaders {
  const map: ParsedHeaders = {};
  for (const header of headers ?? []) {
    if (!header?.name) continue;
    map[header.name.toLowerCase()] = header.value ?? "";
  }
  return map;
}

/** Pulls the bare address out of `"Name" <a@b.com>`. */
export function bareAddress(value: string | undefined | null): string {
  if (!value) return "";
  const match = /<([^>]+)>/.exec(value);
  return (match ? match[1] : value).trim().toLowerCase();
}
