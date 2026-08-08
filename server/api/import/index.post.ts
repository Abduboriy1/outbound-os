import { z } from "zod";
import { HttpError, ok, parseBody, route } from "~~/server/lib/api";
import { audit } from "~~/server/lib/audit";
import { prisma } from "~~/server/lib/db";
import type { DiscoveredLead } from "~~/server/lib/contracts";
import {
  dedupeLeads,
  normalizeDomain,
  normalizeEmail,
} from "~~/shared/leadsources";
import { LEAD_SOURCE_TYPES } from "~~/server/lib/leads/schemas";
import type { LeadSourceType } from "~~/server/generated/prisma/client";

/**
 * Import commits (plan §8) — port of `commitImportAction` and the commit half
 * of `createManualLeadAction` in `src/app/(app)/import/actions.ts`. Both the
 * manual form and the CSV importer land here, so a lead created either way is
 * indistinguishable afterwards.
 *
 * Chaining `POST /api/companies` → `/api/contacts` → `/api/leads` from the
 * browser reproduced most of this, but lost three things that only a single
 * server-side commit can give back, and that this endpoint restores:
 *
 *  1. the `prisma.$transaction` — a failure part-way through no longer leaves
 *     the company it already created behind;
 *  2. the `Imported via <SOURCE>` stage-history reason and the `LEAD_IMPORTED`
 *     activity type, where `createLead` writes `Lead created` / `LEAD_CREATED`;
 *  3. the `leads.imported` audit row.
 *
 * Parsing, mapping and the dedupe preview stay in the browser
 * (`app/components/dashboard/importer.ts`), which is where the source ran them
 * too — `previewImportAction` was a dry run that wrote nothing. The dedupe is
 * repeated here against live rows because the preview the user approved may be
 * minutes old, which is exactly what `commitImportAction` did.
 */

const discoveredSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  domain: z.string().trim().max(255).optional(),
  website: z.string().trim().max(500).optional(),
  industry: z.string().trim().max(120).optional(),
  location: z.string().trim().max(200).optional(),
  employeeCount: z.number().int().positive().max(10_000_000).optional(),
  description: z.string().trim().max(4000).optional(),
  contactFirstName: z.string().trim().max(100).optional(),
  contactLastName: z.string().trim().max(100).optional(),
  contactTitle: z.string().trim().max(150).optional(),
  contactEmail: z.string().trim().max(320).optional(),
  sourceDetail: z.string().trim().max(200).optional(),
});

const batchSchema = z.array(discoveredSchema).min(1).max(2000);

const bodySchema = z.object({
  leads: z.array(z.unknown()),
  sourceType: z.enum(LEAD_SOURCE_TYPES).default("CSV"),
});

/** Existing companies and contacts, as dedupe keys. */
async function existingKeys(userId: string) {
  const [companies, contacts] = await Promise.all([
    prisma.company.findMany({
      where: { userId, deletedAt: null, domain: { not: null } },
      select: { domain: true, name: true },
    }),
    prisma.contact.findMany({
      where: { userId, deletedAt: null, email: { not: null } },
      select: { email: true, firstName: true, lastName: true },
    }),
  ]);

  return [
    ...companies.map((c) => ({ domain: c.domain, label: c.name })),
    ...contacts.map((c) => ({
      email: c.email,
      label: [c.firstName, c.lastName].filter(Boolean).join(" "),
    })),
  ];
}

/**
 * Creates Company -> Contact -> Lead for one discovered lead, plus the stage
 * history and activity rows the pipeline analytics read. Written in a single
 * transaction so a failure halfway cannot leave an orphan company behind.
 */
async function createFromDiscovered(
  userId: string,
  lead: DiscoveredLead,
  sourceType: LeadSourceType,
) {
  const domain = normalizeDomain(lead.domain ?? lead.website);
  const email = normalizeEmail(lead.contactEmail);

  return prisma.$transaction(async (tx) => {
    const existingCompany = domain
      ? await tx.company.findFirst({
          where: { userId, domain, deletedAt: null },
          select: { id: true },
        })
      : null;

    const company =
      existingCompany ??
      (await tx.company.create({
        data: {
          userId,
          name: lead.companyName,
          domain,
          website: lead.website ?? (domain ? `https://${domain}` : null),
          industry: lead.industry ?? null,
          location: lead.location ?? null,
          employeeCount: lead.employeeCount ?? null,
          description: lead.description ?? null,
        },
        select: { id: true },
      }));

    let contactId: string | null = null;
    if (lead.contactFirstName || email) {
      const existingContact = email
        ? await tx.contact.findFirst({
            where: { userId, email, deletedAt: null },
            select: { id: true },
          })
        : null;

      contactId =
        existingContact?.id ??
        (
          await tx.contact.create({
            data: {
              userId,
              companyId: company.id,
              firstName: lead.contactFirstName ?? lead.companyName,
              lastName: lead.contactLastName ?? null,
              title: lead.contactTitle ?? null,
              email,
            },
            select: { id: true },
          })
        ).id;
    }

    const created = await tx.lead.create({
      data: {
        userId,
        companyId: company.id,
        contactId,
        stage: "PROSPECT",
        sourceType,
        sourceDetail: lead.sourceDetail ?? null,
        nextAction: "Research this company",
        lastActivityAt: new Date(),
      },
      select: { id: true },
    });

    await tx.leadStageHistory.create({
      data: {
        leadId: created.id,
        newStage: "PROSPECT",
        reason: `Imported via ${sourceType}`,
        actorType: "HUMAN",
      },
    });

    await tx.activity.create({
      data: {
        userId,
        leadId: created.id,
        companyId: company.id,
        contactId,
        type: "LEAD_IMPORTED",
        summary: `Imported ${lead.companyName}`,
        detail: lead.sourceDetail ?? null,
        actorType: "HUMAN",
      },
    });

    return { leadId: created.id, companyId: company.id };
  });
}

export default route(async (event, { user }) => {
  const body = await parseBody(event, bodySchema);

  // `commitImportAction` answered "Nothing valid to import" rather than
  // surfacing the issue list, so the batch is parsed separately from the
  // envelope to keep that message.
  const parsed = batchSchema.safeParse(body.leads);
  if (!parsed.success) throw new HttpError("Nothing valid to import", 422);

  const deduped = dedupeLeads(parsed.data, await existingKeys(user.id));

  const createdLeadIds: string[] = [];
  for (const { lead } of deduped.unique) {
    const result = await createFromDiscovered(user.id, lead, body.sourceType);
    createdLeadIds.push(result.leadId);
  }

  await audit({
    userId: user.id,
    action: "leads.imported",
    entityType: "Lead",
    // The manual form imports exactly one lead and the source recorded its id.
    entityId: createdLeadIds.length === 1 ? createdLeadIds[0] : undefined,
    metadata: {
      sourceType: body.sourceType,
      created: createdLeadIds.length,
      skipped: deduped.duplicates.length,
    },
  });

  return ok({
    created: createdLeadIds.length,
    skipped: deduped.duplicates.length,
    leadIds: createdLeadIds,
    duplicates: deduped.duplicates.map(({ index, lead, reason, matched }) => ({
      index,
      lead,
      reason,
      matched,
    })),
  });
});
