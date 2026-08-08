import type { LeadStage, Prisma } from "~~/server/generated/prisma/client";
import { audit } from "~~/server/lib/audit";
import { prisma } from "~~/server/lib/db";
import { env } from "~~/server/lib/env";
import { enqueue } from "~~/server/lib/queue";
import {
  authorizeIntake,
  checkRateLimit,
  clientIp,
  planIntake,
  validateIntake,
  type NormalizedIntake,
  type RateLimitStore,
} from "./validate";

/**
 * Public website intake (plan §56, §57). This is the one endpoint in the app
 * that is reachable without a session: the marketing site posts here with a
 * bearer token. The auth middleware already excludes /api, so the gate is the
 * token check below.
 *
 * The submitted text is untrusted. It is stored verbatim as data — on an
 * Activity and as a ResearchSource snippet — so that when the research agent
 * later reads it, it arrives as an `AiRequest.data` document and never as an
 * instruction.
 *
 * Ported from `src/app/api/intake/route.ts`. It is written against the Web
 * `Request`/`Response` pair rather than h3 so the behaviour stays directly
 * testable (see handler.test.ts) and so the thin Nitro route in
 * `server/api/intake/index.post.ts` carries no logic of its own.
 */

const rateLimitStore: RateLimitStore = new Map();

/** Stages where the lead is finished; a new submission deserves a fresh lead. */
const CLOSED_STAGES: LeadStage[] = [
  "WON",
  "LOST",
  "CUSTOMER",
  "NOT_A_FIT",
  "DO_NOT_CONTACT",
];

function json(body: unknown, status: number, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const ok = (data: unknown, status = 200) => json({ data }, status);
const fail = (error: string, status = 400, details?: unknown) =>
  json({ error, details }, status);

export async function handleIntake(req: Request): Promise<Response> {
  try {
    if (!authorizeIntake(req.headers.get("authorization"), env().INTAKE_API_TOKEN)) {
      return fail("Unauthorized", 401);
    }

    const limit = checkRateLimit(rateLimitStore, clientIp(req.headers), Date.now());
    if (!limit.allowed) {
      return json({ error: "Too many requests" }, 429, {
        "Retry-After": String(limit.retryAfterSeconds),
      });
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return fail("Request body must be valid JSON", 400);
    }

    const validated = validateIntake(raw);
    if (!validated.ok) return fail("Validation failed", 422, validated.issues);

    await recordSubmission(validated.value);

    // Deliberately opaque: the website is a public client and learns nothing
    // about internal ids or whether this company was already known.
    return ok({ ok: true }, 202);
  } catch (error) {
    console.error("[api]", error);
    return fail("Internal server error", 500);
  }
}

/**
 * Creates or reuses Company -> Contact -> Lead and queues research. The whole
 * write is one transaction so a partially created inbound lead can never be
 * left behind.
 */
async function recordSubmission(intake: NormalizedIntake) {
  const owner = await prisma.user.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  // Nothing to attach the lead to yet; the caller still gets a 202 rather than
  // a stack trace, and the submission is recorded in the audit log below.
  if (!owner) {
    await audit({
      actorType: "SYSTEM",
      action: "intake.dropped_no_owner",
      entityType: "Lead",
      metadata: { company: intake.company },
    });
    return;
  }

  const userId = owner.id;

  const existingCompany = intake.domain
    ? await prisma.company.findFirst({
        where: { userId, domain: intake.domain, deletedAt: null },
        select: { id: true },
      })
    : await prisma.company.findFirst({
        where: {
          userId,
          deletedAt: null,
          name: { equals: intake.company, mode: "insensitive" },
        },
        select: { id: true },
      });

  const existingContact = await prisma.contact.findFirst({
    where: { userId, email: intake.email, deletedAt: null },
    select: { id: true },
  });

  const existingLead = existingCompany
    ? await prisma.lead.findFirst({
        where: {
          userId,
          companyId: existingCompany.id,
          deletedAt: null,
          stage: { notIn: CLOSED_STAGES },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      })
    : null;

  const plan = planIntake({
    companyId: existingCompany?.id ?? null,
    contactId: existingContact?.id ?? null,
    openLeadId: existingLead?.id ?? null,
  });

  const [firstName, ...rest] = intake.name.split(/\s+/);

  const submission: Prisma.InputJsonObject = {
    // Marked so every downstream reader knows this text came from the public
    // internet and must be treated as data (plan §36).
    untrusted: true,
    problemDescription: intake.problemDescription,
    frequency: intake.frequency,
    peopleInvolved: intake.peopleInvolved,
    toolsInvolved: intake.toolsInvolved,
    submittedName: intake.name,
    submittedCompany: intake.company,
    submittedWebsite: intake.companyWebsite,
    attribution: { ...intake.attribution },
  };

  const result = await prisma.$transaction(async (tx) => {
    const company = plan.createCompany
      ? await tx.company.create({
          data: {
            userId,
            name: intake.company,
            domain: intake.domain,
            website: intake.companyWebsite ?? (intake.domain ? `https://${intake.domain}` : null),
            metadata: { intake: submission },
          },
          select: { id: true },
        })
      : existingCompany!;

    const contact = plan.createContact
      ? await tx.contact.create({
          data: {
            userId,
            companyId: company.id,
            firstName: firstName || intake.name,
            lastName: rest.join(" ") || null,
            email: intake.email,
            relationshipStatus: "INBOUND",
            lastInteractionAt: new Date(),
          },
          select: { id: true },
        })
      : existingContact!;

    const lead = plan.createLead
      ? await tx.lead.create({
          data: {
            userId,
            companyId: company.id,
            contactId: contact.id,
            stage: "PROSPECT",
            sourceType: "WEBSITE_FORM",
            sourceDetail: intake.attribution.landingPage ?? "Website intake form",
            nextAction: "Review inbound submission and respond",
            lastActivityAt: new Date(),
            utmSource: intake.attribution.utmSource,
            utmMedium: intake.attribution.utmMedium,
            utmCampaign: intake.attribution.utmCampaign,
            referrer: intake.attribution.referrer,
            landingPage: intake.attribution.landingPage,
          },
          select: { id: true },
        })
      : existingLead!;

    await tx.activity.create({
      data: {
        userId,
        leadId: lead.id,
        companyId: company.id,
        contactId: contact.id,
        type: "WEBSITE_FORM_SUBMISSION",
        summary: plan.duplicate
          ? `Repeat website submission from ${intake.company}`
          : `Website submission from ${intake.company}`,
        detail: intake.problemDescription,
        actorType: "SYSTEM",
        metadata: submission,
      },
    });

    // Stored as a research source so the research agent picks the prospect's
    // own words up through the same untrusted-document path as scraped pages.
    await tx.researchSource.create({
      data: {
        companyId: company.id,
        kind: "WEBSITE_FORM",
        title: "Prospect-submitted problem description",
        url: intake.attribution.landingPage,
        snippet: intake.problemDescription,
      },
    });

    // The PENDING report is created inside the transaction so the research
    // queue shows the lead immediately; the job itself is enqueued after the
    // transaction commits, so the worker can never read a row that is not
    // there yet.
    const reportId = plan.createLead
      ? (
          await tx.researchReport.create({
            data: { leadId: lead.id, companyId: company.id, status: "PENDING" },
            select: { id: true },
          })
        ).id
      : null;

    return {
      leadId: lead.id,
      companyId: company.id,
      duplicate: plan.duplicate,
      reportId,
    };
  });

  if (result.reportId) {
    // Never let a queue problem fail the visitor's submission: the lead is
    // already saved, and the report row stays PENDING for a manual re-run.
    try {
      await enqueue("research", {
        leadId: result.leadId,
        userId,
        reportId: result.reportId,
      });
    } catch (error) {
      console.error("[intake] failed to enqueue research", error);
    }
  }

  await audit({
    userId,
    actorType: "SYSTEM",
    action: result.duplicate ? "intake.repeat_submission" : "intake.lead_created",
    entityType: "Lead",
    entityId: result.leadId,
    metadata: {
      source: "WEBSITE_FORM",
      utmSource: intake.attribution.utmSource,
      utmCampaign: intake.attribution.utmCampaign,
      landingPage: intake.attribution.landingPage,
    },
  });

  return result;
}
