/**
 * AIService — the only way anything in this app talks to a model (plan §31).
 *
 * Routes, jobs, and components call this; nothing calls a provider or an SDK
 * directly. Centralising it buys three things the plan requires:
 *   - every call is recorded as an `AiRun`, success or failure, with the
 *     sanitised input actually sent, the structured output, the raw text, token
 *     counts, and latency;
 *   - output is validated with Zod before any caller sees it, so a malformed
 *     response fails here rather than three layers down;
 *   - the untrusted-document boundary is applied in one place.
 */

import type { ZodType } from "zod";
import { ZodError } from "zod";
import type { AgentName, AiProvider, AiResponse, UntrustedDocument } from "~~/server/lib/contracts";
import type { Prisma } from "~~/server/generated/prisma/client";
import { prisma } from "~~/server/lib/db";
import { audit } from "~~/server/lib/audit";
import { getAiProvider } from "./provider";
import type { AgentRequest } from "./prompt";
import { sanitizeDocument, detectInjection } from "./sanitize";

export type AiRunResult<T> = {
  data: T;
  runId: string;
  rawText: string;
  model: string;
  provider: string;
  latencyMs: number;
  /** Injection heuristics that fired on the supplied documents (plan §36). */
  injectionFindings: { rule: string; match: string }[];
};

export class AiRunError extends Error {
  constructor(
    message: string,
    readonly runId: string | null,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AiRunError";
  }
}

export type RunOptions<T> = {
  agent: AgentName;
  userId: string;
  leadId?: string | null;
  request: AgentRequest;
  /** Validated before the caller sees anything. */
  schema: ZodType<T>;
};

export class AIService {
  constructor(private readonly provider: AiProvider = getAiProvider()) {}

  get providerName() {
    return this.provider.name;
  }

  async run<T>(options: RunOptions<T>): Promise<AiRunResult<T>> {
    const documents = (options.request.data ?? []).map(sanitizeDocument);
    const injectionFindings = (options.request.data ?? []).flatMap((doc) =>
      detectInjection(doc.content).map((finding) => ({
        ...finding,
        match: `${doc.label}: ${finding.match}`,
      })),
    );

    // The provider receives the sanitised documents, never the originals.
    const request = { ...options.request, agent: options.agent, data: documents };

    const run = await prisma.aiRun.create({
      data: {
        userId: options.userId,
        leadId: options.leadId ?? null,
        agent: options.agent,
        status: "RUNNING",
        provider: this.provider.name,
        model: this.provider.model,
        input: sanitisedInput(request.system, request.instruction, documents, injectionFindings),
      },
      select: { id: true },
    });

    let response: AiResponse<unknown>;
    try {
      response = await this.provider.complete(request);
    } catch (error) {
      await this.fail(run.id, options, error, null);
      throw new AiRunError(
        `${options.agent} agent call failed: ${messageOf(error)}`,
        run.id,
        error,
      );
    }

    let data: T;
    try {
      data = options.schema.parse(response.data);
    } catch (error) {
      const detail =
        error instanceof ZodError
          ? error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; ")
          : messageOf(error);
      await this.fail(run.id, options, error, response, `Schema validation failed: ${detail}`);
      throw new AiRunError(
        `${options.agent} agent returned output that does not match its schema (${detail})`,
        run.id,
        error,
      );
    }

    await prisma.aiRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        model: response.model,
        provider: response.provider,
        output: data as Prisma.InputJsonValue,
        rawText: truncate(response.rawText, 40_000),
        promptTokens: response.promptTokens ?? null,
        completionTokens: response.completionTokens ?? null,
        latencyMs: response.latencyMs,
      },
    });

    await audit({
      userId: options.userId,
      actorType: "AI",
      action: "ai.run",
      entityType: "AiRun",
      entityId: run.id,
      metadata: {
        agent: options.agent,
        provider: response.provider,
        model: response.model,
        leadId: options.leadId ?? null,
        latencyMs: response.latencyMs,
        injectionFindings: injectionFindings.length,
      },
    });

    return {
      data,
      runId: run.id,
      rawText: response.rawText,
      model: response.model,
      provider: response.provider,
      latencyMs: response.latencyMs,
      injectionFindings,
    };
  }

  private async fail<T>(
    runId: string,
    options: RunOptions<T>,
    error: unknown,
    response: AiResponse<unknown> | null,
    message?: string,
  ) {
    await prisma.aiRun
      .update({
        where: { id: runId },
        data: {
          status: "FAILED",
          error: truncate(message ?? messageOf(error), 4_000),
          rawText: response ? truncate(response.rawText, 40_000) : null,
          promptTokens: response?.promptTokens ?? null,
          completionTokens: response?.completionTokens ?? null,
          latencyMs: response?.latencyMs ?? null,
        },
      })
      .catch((updateError) => {
        console.error("[ai] could not record failed run", updateError);
      });

    await audit({
      userId: options.userId,
      actorType: "AI",
      action: "ai.run.failed",
      entityType: "AiRun",
      entityId: runId,
      metadata: {
        agent: options.agent,
        leadId: options.leadId ?? null,
        error: truncate(message ?? messageOf(error), 500),
      },
    });
  }
}

let singleton: AIService | null = null;

/** Shared instance. Pass a provider only in tests. */
export function aiService(provider?: AiProvider) {
  if (provider) return new AIService(provider);
  singleton ??= new AIService();
  return singleton;
}

/** Test hook — drops the cached service so a new provider takes effect. */
export function resetAiService() {
  singleton = null;
}

/**
 * What is stored on the AiRun row. This is the text that actually went to the
 * model, post-sanitisation, which is the only version worth keeping for debugging.
 */
function sanitisedInput(
  system: string,
  instruction: string,
  documents: UntrustedDocument[],
  findings: { rule: string; match: string }[],
): Prisma.InputJsonValue {
  return {
    system,
    instruction: truncate(instruction, 20_000),
    documents: documents.map((doc) => ({
      label: doc.label,
      url: doc.url ?? null,
      chars: doc.content.length,
      content: truncate(doc.content, 4_000),
    })),
    injectionFindings: findings.slice(0, 20),
  };
}

function truncate(value: string, max: number) {
  if (!value) return value;
  return value.length > max ? `${value.slice(0, max)}\n[truncated]` : value;
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
