import crypto from "node:crypto";
import { env } from "./env";

const ALGORITHM = "aes-256-gcm";

export type Sealed = { ciphertext: string; iv: string; authTag: string };

function key() {
  return Buffer.from(env().ENCRYPTION_KEY, "hex");
}

/**
 * Encrypts an integration secret (OAuth token, API key) before it is stored.
 * Plan §36: credentials are never persisted in plaintext.
 */
export function seal(plaintext: string): Sealed {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function open(sealed: Sealed): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key(),
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
