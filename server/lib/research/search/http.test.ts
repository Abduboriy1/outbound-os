import { describe, expect, it } from "vitest";
import { assertPublicUrl, isBlockedHostname, isPrivateAddress } from "./http";

/**
 * SSRF guard. These run offline: `assertPublicUrl` only resolves DNS for
 * hostnames, so the cases below use literal IPs and reserved names.
 */

describe("isPrivateAddress", () => {
  const blocked = [
    "127.0.0.1",
    "0.0.0.0",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1", // carrier-grade NAT
    "198.18.0.1",
    "224.0.0.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "fd00::abcd",
    "::ffff:127.0.0.1",
  ];
  it.each(blocked)("blocks %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  const allowed = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "2606:4700::1111"];
  it.each(allowed)("allows %s", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });

  it("treats malformed input as private, failing closed", () => {
    expect(isPrivateAddress("not-an-address")).toBe(true);
    expect(isPrivateAddress("")).toBe(true);
  });
});

describe("isBlockedHostname", () => {
  it.each([
    "localhost",
    "app.localhost",
    "printer.local",
    "db.internal",
    "metadata.google.internal",
  ])("blocks %s", (host) => {
    expect(isBlockedHostname(host)).toBe(true);
  });

  it("allows an ordinary public hostname", () => {
    expect(isBlockedHostname("acme.example")).toBe(false);
  });
});

describe("assertPublicUrl", () => {
  it("rejects non-http protocols", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow(/unsupported protocol/);
    await expect(assertPublicUrl("gopher://acme.example")).rejects.toThrow(/unsupported protocol/);
  });

  it("rejects credentials in the URL", async () => {
    await expect(assertPublicUrl("https://user:pass@93.184.216.34/")).rejects.toThrow(
      /credentials/,
    );
  });

  it("rejects loopback and metadata targets", async () => {
    await expect(assertPublicUrl("http://127.0.0.1:5432/")).rejects.toThrow(/private address/);
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(
      /private address/,
    );
    await expect(assertPublicUrl("http://localhost:3000/")).rejects.toThrow(/blocked host/);
    await expect(assertPublicUrl("http://[::1]/")).rejects.toThrow(/private address/);
  });

  it("accepts a public literal address", async () => {
    const url = await assertPublicUrl("https://93.184.216.34/careers");
    expect(url.pathname).toBe("/careers");
  });
});
