/**
 * Gmail provider (plan §17, §35, §36).
 *
 * OAuth tokens never exist in the database as plaintext: they are sealed with
 * AES-256-GCM by `~~/server/lib/crypto` and stored in `IntegrationCredential`. The
 * refresh token is re-sealed on every refresh so a rotated token is not lost.
 */

import { google, type gmail_v1 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { prisma } from "~~/server/lib/db";
import { env } from "~~/server/lib/env";
import { open, seal } from "~~/server/lib/crypto";
import type {
  EmailProvider,
  IncomingEmail,
  OutgoingEmail,
  SentEmail,
} from "~~/server/lib/contracts";
import { detectBounce } from "../detect";
import {
  bareAddress,
  buildRfc822,
  fromBase64Url,
  headerMap,
  toBase64Url,
} from "../rfc822";

export const GMAIL_INTEGRATION = { kind: "email", provider: "gmail" } as const;

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

/** Mirrors google-auth-library's `Credentials`, which we round-trip as JSON. */
export type StoredTokens = {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string;
  token_type?: string | null;
  expiry_date?: number | null;
  id_token?: string | null;
};

export class GmailNotConnectedError extends Error {
  constructor() {
    super(
      "Gmail is not connected. Visit Settings and authorise Gmail, or set EMAIL_PROVIDER=mock.",
    );
    this.name = "GmailNotConnectedError";
  }
}

/* ----------------------------------------------------------------- oauth */

function oauthClient(): OAuth2Client {
  const config = env();
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set to use the Gmail provider.",
    );
  }
  return new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_REDIRECT_URI,
  );
}

/**
 * Builds the consent URL. `state` carries the signed-in user id so the
 * callback can attribute the tokens without trusting the query string alone
 * (the callback also re-checks the session).
 */
export function gmailAuthUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: GMAIL_SCOPES,
    state,
  });
}

/** Exchanges the authorisation code and stores the sealed tokens. */
export async function completeGmailAuth(
  userId: string,
  code: string,
): Promise<{ emailAddress: string | null }> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) throw new Error("Google returned no access token");
  client.setCredentials(tokens);

  let emailAddress: string | null = null;
  try {
    const profile = await google
      .gmail({ version: "v1", auth: client })
      .users.getProfile({ userId: "me" });
    emailAddress = profile.data.emailAddress ?? null;
  } catch {
    // Profile lookup is a nicety; a missing address must not fail the connect.
  }

  const integration = await prisma.integration.upsert({
    where: {
      userId_kind_provider: {
        userId,
        kind: GMAIL_INTEGRATION.kind,
        provider: GMAIL_INTEGRATION.provider,
      },
    },
    create: {
      userId,
      kind: GMAIL_INTEGRATION.kind,
      provider: GMAIL_INTEGRATION.provider,
      isEnabled: true,
      config: { emailAddress, scopes: GMAIL_SCOPES },
    },
    update: {
      isEnabled: true,
      config: { emailAddress, scopes: GMAIL_SCOPES },
    },
  });

  await storeTokens(integration.id, tokens as StoredTokens);
  return { emailAddress };
}

async function storeTokens(integrationId: string, tokens: StoredTokens) {
  const sealed = seal(JSON.stringify(tokens));
  const existing = await prisma.integrationCredential.findFirst({
    where: { integrationId },
    orderBy: { createdAt: "desc" },
  });
  const data = {
    ciphertext: sealed.ciphertext,
    iv: sealed.iv,
    authTag: sealed.authTag,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  };
  if (existing) {
    await prisma.integrationCredential.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await prisma.integrationCredential.create({
      data: { integrationId, ...data },
    });
  }
}

export async function loadGmailClient(userId: string): Promise<OAuth2Client> {
  const integration = await prisma.integration.findUnique({
    where: {
      userId_kind_provider: {
        userId,
        kind: GMAIL_INTEGRATION.kind,
        provider: GMAIL_INTEGRATION.provider,
      },
    },
    include: { credentials: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const credential = integration?.credentials[0];
  if (!integration?.isEnabled || !credential) throw new GmailNotConnectedError();

  const tokens = JSON.parse(open(credential)) as StoredTokens;
  const client = oauthClient();
  client.setCredentials(tokens);

  const expired =
    !tokens.expiry_date || tokens.expiry_date - Date.now() < 60_000;
  if (expired && tokens.refresh_token) {
    const refreshed = await client.refreshAccessToken();
    const next: StoredTokens = {
      ...tokens,
      ...refreshed.credentials,
      // Google omits the refresh token on refresh; keep the original.
      refresh_token: refreshed.credentials.refresh_token ?? tokens.refresh_token,
    };
    client.setCredentials(next);
    await storeTokens(integration.id, next);
  }

  return client;
}

export async function gmailConnection(userId: string) {
  const integration = await prisma.integration.findUnique({
    where: {
      userId_kind_provider: {
        userId,
        kind: GMAIL_INTEGRATION.kind,
        provider: GMAIL_INTEGRATION.provider,
      },
    },
    include: { credentials: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!integration) return { connected: false as const };
  const config = (integration.config ?? {}) as { emailAddress?: string };
  return {
    connected: integration.isEnabled && integration.credentials.length > 0,
    emailAddress: config.emailAddress ?? null,
    expiresAt: integration.credentials[0]?.expiresAt ?? null,
  };
}

export async function disconnectGmail(userId: string) {
  await prisma.integration.updateMany({
    where: {
      userId,
      kind: GMAIL_INTEGRATION.kind,
      provider: GMAIL_INTEGRATION.provider,
    },
    data: { isEnabled: false },
  });
}

/* -------------------------------------------------------------- provider */

export class GmailEmailProvider implements EmailProvider {
  readonly name = "gmail";

  constructor(private readonly userId: string) {}

  private async api(): Promise<gmail_v1.Gmail> {
    return google.gmail({ version: "v1", auth: await loadGmailClient(this.userId) });
  }

  async send(email: OutgoingEmail): Promise<SentEmail> {
    const gmail = await this.api();
    const raw = toBase64Url(buildRfc822(email));
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
        ...(email.threadId ? { threadId: email.threadId } : {}),
      },
    });

    const id = response.data.id;
    if (!id) throw new Error("Gmail accepted the message but returned no id");
    return {
      providerMessageId: id,
      providerThreadId: response.data.threadId ?? id,
      sentAt: new Date(),
    };
  }

  /**
   * Incremental pull. Gmail's `after:` query operator takes epoch seconds, so
   * repeated polls only transfer what arrived since the last successful run.
   */
  async fetchIncoming(since: Date): Promise<IncomingEmail[]> {
    const gmail = await this.api();
    const afterSeconds = Math.floor(since.getTime() / 1000);
    const list = await gmail.users.messages.list({
      userId: "me",
      q: `-in:chats -in:sent after:${afterSeconds}`,
      maxResults: 50,
    });

    const results: IncomingEmail[] = [];
    for (const stub of list.data.messages ?? []) {
      if (!stub.id) continue;
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: stub.id,
        format: "full",
      });
      const parsed = parseGmailMessage(detail.data);
      if (parsed && parsed.receivedAt >= since) results.push(parsed);
    }

    results.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
    return results;
  }
}

/* --------------------------------------------------------------- parsing */

export function parseGmailMessage(
  message: gmail_v1.Schema$Message,
): IncomingEmail | null {
  if (!message.id) return null;
  const headers = headerMap(message.payload?.headers ?? undefined);
  const body = extractPlainText(message.payload ?? undefined) ?? message.snippet ?? "";
  const subject = headers.subject ?? "(no subject)";
  const from = bareAddress(headers.from);
  const to = bareAddress(headers.to);
  const receivedAt = message.internalDate
    ? new Date(Number(message.internalDate))
    : new Date();

  const bounce = detectBounce({ from, subject, body });

  return {
    providerMessageId: message.id,
    providerThreadId: message.threadId ?? message.id,
    from,
    to,
    subject,
    body,
    snippet: message.snippet ?? body.slice(0, 160),
    receivedAt,
    isBounce: bounce.isBounce,
  };
}

/** Depth-first search for the first text/plain part; falls back to HTML. */
export function extractPlainText(
  part: gmail_v1.Schema$MessagePart | undefined,
): string | null {
  if (!part) return null;
  if (part.mimeType === "text/plain" && part.body?.data) {
    return fromBase64Url(part.body.data);
  }
  for (const child of part.parts ?? []) {
    const found = extractPlainText(child);
    if (found) return found;
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return stripHtml(fromBase64Url(part.body.data));
  }
  if (part.body?.data) return fromBase64Url(part.body.data);
  return null;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
