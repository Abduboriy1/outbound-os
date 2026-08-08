/**
 * Integration contracts (plan §35). Everything third-party sits behind one of
 * these interfaces so the app is never coupled to a single vendor, and so the
 * whole product runs offline against mock implementations.
 *
 * This file is the seam between subsystems: it declares shapes only and must
 * stay free of imports from feature modules.
 */

/* ------------------------------------------------------------------ AI */

export type AgentName =
  | "research"
  | "qualification"
  | "opportunity"
  | "outreach"
  | "reply"
  | "discovery"
  | "proposal"
  | "salesCoach";

/**
 * A single model call. `system` carries the operator's instructions; `data`
 * carries untrusted material (scraped pages, prospect emails). They are kept
 * apart on purpose — plan §36 requires that researched content can never be
 * interpreted as an instruction.
 */
export type AiRequest = {
  agent: AgentName;
  system: string;
  instruction: string;
  /** Untrusted source material, wrapped and neutralised before it reaches the model. */
  data?: UntrustedDocument[];
  /** JSON Schema the response must satisfy. */
  responseSchema: Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
};

export type UntrustedDocument = {
  label: string;
  url?: string;
  content: string;
};

export type AiResponse<T = unknown> = {
  data: T;
  rawText: string;
  model: string;
  provider: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
};

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  complete<T = unknown>(request: AiRequest): Promise<AiResponse<T>>;
}

/* --------------------------------------------------------------- email */

export type OutgoingEmail = {
  to: string;
  toName?: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  /** Set to continue an existing thread rather than start a new one. */
  threadId?: string;
  inReplyTo?: string;
};

export type SentEmail = {
  providerMessageId: string;
  providerThreadId: string;
  sentAt: Date;
};

export type IncomingEmail = {
  providerMessageId: string;
  providerThreadId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  snippet: string;
  receivedAt: Date;
  isBounce: boolean;
};

export interface EmailProvider {
  readonly name: string;
  send(email: OutgoingEmail): Promise<SentEmail>;
  /** Returns messages received since the given time, newest last. */
  fetchIncoming(since: Date): Promise<IncomingEmail[]>;
}

/* -------------------------------------------------------------- search */

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  source: string;
};

export interface SearchProvider {
  readonly name: string;
  search(query: string, limit?: number): Promise<SearchResult[]>;
  /** Fetches a page and returns readable text, or null if unavailable. */
  fetchPage(url: string): Promise<{ title: string; text: string } | null>;
}

/* ---------------------------------------------------------------- lead */

export type DiscoveredLead = {
  companyName: string;
  domain?: string;
  website?: string;
  industry?: string;
  location?: string;
  employeeCount?: number;
  description?: string;
  contactFirstName?: string;
  contactLastName?: string;
  contactTitle?: string;
  contactEmail?: string;
  sourceDetail?: string;
};

/** Plan §8 — lead sources are pluggable; the app never depends on one vendor. */
export interface LeadProvider {
  readonly name: string;
  readonly kind: "manual" | "csv" | "search" | "directory" | "jobs" | "form";
  discover(input: unknown): Promise<DiscoveredLead[]>;
}
