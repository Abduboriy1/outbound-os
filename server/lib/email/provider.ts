/**
 * Email provider factory (plan §35). `mock` is the default so the whole
 * outreach flow — approve, send, poll, classify — runs with no Gmail account
 * and no API keys.
 */

import { env } from "~~/server/lib/env";
import type { EmailProvider } from "~~/server/lib/contracts";
import { MockEmailProvider } from "./providers/mock";
import { GmailEmailProvider } from "./providers/gmail";

export function emailProvider(userId: string): EmailProvider {
  switch (env().EMAIL_PROVIDER) {
    case "gmail":
      return new GmailEmailProvider(userId);
    case "mock":
    default:
      return new MockEmailProvider(userId);
  }
}

export function emailProviderName(): string {
  return env().EMAIL_PROVIDER;
}

export { MockEmailProvider, GmailEmailProvider };
export type { EmailProvider };
