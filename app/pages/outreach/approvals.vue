<script setup lang="ts">
/**
 * Port of `src/app/(app)/outreach/approvals/page.tsx`.
 *
 * Plan §16 — nothing leaves this page without an explicit approve click.
 *
 * The Next page was a server component running three Prisma queries. Here each
 * becomes a `useFetch` (MIGRATION.md §5):
 *   - `pendingApprovals`   → `GET /api/outreach/drafts`
 *   - `complianceStatus`   → `GET /api/outreach/compliance`
 *   - `leadsAwaitingDraft` → `GET /api/leads` + the filtering below
 */
import { computed } from "vue";
import type { LeadStage } from "~~/server/generated/prisma/client";
import ApprovalCard from "~/components/outreach/ApprovalCard.vue";
import GenerateDraftForm from "~/components/outreach/GenerateDraftForm.vue";
import { STAGE_LABELS } from "~/components/outreach/constants";
import type {
  ApprovalDraft,
  ComplianceStatus,
  LeadListRow,
} from "~/components/outreach/types";

const { data: drafts, refresh: refreshDrafts } = await useFetch(
  "/api/outreach/drafts",
  {
    transform: (res: { data: ApprovalDraft[] }) => res.data,
    default: () => [] as ApprovalDraft[],
  },
);

/** The same `complianceStatus()` read model the server component used. */
const { data: compliance, refresh: refreshCompliance } = await useFetch(
  "/api/outreach/compliance",
  { transform: (res: { data: ComplianceStatus }) => res.data },
);

const { data: leads, refresh: refreshLeads } = await useFetch("/api/leads", {
  query: { stage: "QUALIFIED,READY_FOR_OUTREACH", sort: "score", dir: "desc" },
  transform: (res: { data: { leads: LeadListRow[]; total: number } }) =>
    res.data.leads,
  default: () => [] as LeadListRow[],
});

const footerPreview = computed(() => compliance.value?.footerPreview ?? null);

const blocked = computed(
  () => drafts.value.filter((draft) => draft.blocks.length > 0).length,
);

/**
 * `leadsAwaitingDraft` also excluded leads whose only draft is APPROVED or
 * SENT; `/api/outreach/drafts` lists the pending ones only, so those two are
 * not excluded here.
 */
const ready = computed(() => {
  const drafted = new Set(drafts.value.map((draft) => draft.leadId));
  return leads.value
    .filter((lead) => lead.contact != null && !drafted.has(lead.id))
    .slice(0, 20);
});

function contactName(lead: LeadListRow) {
  if (!lead.contact) return "—";
  return `${lead.contact.firstName} ${lead.contact.lastName ?? ""}`.trim();
}

async function onResult() {
  await Promise.all([refreshDrafts(), refreshCompliance(), refreshLeads()]);
}
</script>

<template>
  <div class="space-y-5">
    <UiPageHeader
      title="Approval queue"
      description="Every AI-written message waits here. Nothing is sent without an explicit approval, and every send passes the compliance gate first."
    />

    <div class="grid gap-3 sm:grid-cols-4">
      <UiStatCard label="Ready for review" :value="drafts.length" />
      <UiStatCard
        label="Blocked by compliance"
        :value="blocked"
        :tone="blocked > 0 ? 'danger' : 'neutral'"
      />
      <UiStatCard
        label="Sent today"
        :value="
          compliance
            ? `${compliance.sentToday} / ${compliance.dailySendLimit}`
            : '—'
        "
        :sub="compliance ? `Provider: ${compliance.provider}` : undefined"
      />
      <UiStatCard label="Suppression list" :value="compliance?.suppressed ?? '—'" />
    </div>

    <UiCard v-if="compliance && !compliance.configured" class="border-danger">
      <UiCardBody class="text-sm">
        <p class="font-medium text-danger">
          Sending is disabled until compliance settings are configured.
        </p>
        <p class="mt-1 text-xs text-muted">
          A sender name, sender email, and physical mailing address are required
          before any message can go out (plan §37). Set them in Settings.
        </p>
      </UiCardBody>
    </UiCard>

    <UiEmptyState
      v-if="drafts.length === 0"
      title="Nothing waiting for review"
      description="Draft a message for a qualified lead below, or let a sequence queue one."
    />
    <div v-else class="space-y-4">
      <ApprovalCard
        v-for="draft in drafts"
        :key="draft.id"
        :draft="draft"
        :footer-preview="footerPreview"
        @result="onResult"
      />
    </div>

    <UiCard>
      <UiCardHeader
        title="Ready for outreach"
        description="Qualified leads with no draft waiting."
      />
      <UiCardBody class="p-0">
        <p v-if="ready.length === 0" class="p-4 text-sm text-muted">
          No qualified leads are waiting for a first message.
        </p>
        <UiTable v-else>
          <thead>
            <tr>
              <UiTh>Company</UiTh>
              <UiTh>Contact</UiTh>
              <UiTh>Stage</UiTh>
              <UiTh>Score</UiTh>
              <UiTh>Draft</UiTh>
            </tr>
          </thead>
          <tbody>
            <tr v-for="lead in ready" :key="lead.id">
              <UiTd>
                <NuxtLink :to="`/leads/${lead.id}`" class="hover:underline">
                  {{ lead.company.name }}
                </NuxtLink>
                <span v-if="lead.company.industry" class="block text-xs text-muted">
                  {{ lead.company.industry }}
                </span>
              </UiTd>
              <UiTd class="text-xs">{{ contactName(lead) }}</UiTd>
              <UiTd>
                <UiBadge>{{ STAGE_LABELS[lead.stage as LeadStage] }}</UiBadge>
              </UiTd>
              <UiTd class="tabular-nums">{{ lead.overallScore ?? "—" }}</UiTd>
              <UiTd>
                <GenerateDraftForm :lead-id="lead.id" @result="onResult" />
              </UiTd>
            </tr>
          </tbody>
        </UiTable>
      </UiCardBody>
    </UiCard>
  </div>
</template>
