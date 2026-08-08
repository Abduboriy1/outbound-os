<script setup lang="ts">
/**
 * Port of `src/app/(app)/deals/proposals/page.tsx`.
 * Plan §24 — proposals, their versions, and what they are worth.
 *
 * GAP: the proposal list came from `prisma.proposal`; MIGRATION.md §4 exposes
 * no proposals endpoint. The list is fetched from the route such an endpoint
 * would occupy (`/api/proposals`) and defaults to empty, so today the page
 * renders the source's "No proposals yet" state. The close-rate figures come
 * from `/api/analytics`, which runs the same `computeFunnel` the source used.
 */
import { formatCurrency, formatRange, relativeTime } from "~/utils/format";
import { STAGE_LABELS, STAGE_TONES } from "~/components/dashboard/constants";
import type { AnalyticsResponse } from "~/components/dashboard/api";
import type { Tone } from "~~/shared/tone";
import type { LeadStage } from "~~/server/generated/prisma/client";

const STATUS_TONES: Record<string, Tone> = {
  DRAFT: "neutral",
  SENT: "accent",
  ACCEPTED: "positive",
  REJECTED: "warning",
};

type ProposalVersion = {
  version: number;
  investmentMin: number | null;
  investmentMax: number | null;
};

type Proposal = {
  id: string;
  title: string;
  status: string;
  sentAt: string | null;
  company: { name: string };
  lead: { id: string; stage: LeadStage; wonAt: string | null; lostAt: string | null };
  versions: ProposalVersion[];
};

const [{ data: proposals }, { data: report }] = await Promise.all([
  useFetch("/api/proposals", {
    key: "proposals-list",
    default: () => [] as Proposal[],
    transform: (res) => (res as unknown as { data: Proposal[] }).data,
  }),
  useFetch("/api/analytics", {
    key: "proposals-analytics",
    transform: (res: { data: AnalyticsResponse }) => res.data,
  }),
]);

const proposalStep = computed(() =>
  report.value?.funnel.find((s) => s.key === "PROPOSAL"),
);
const wonStep = computed(() => report.value?.funnel.find((s) => s.key === "WON"));

const outstanding = computed(() =>
  (proposals.value ?? []).filter(
    (p) => p.status === "SENT" && !p.lead.wonAt && !p.lead.lostAt,
  ),
);

const outstandingValue = computed(() =>
  outstanding.value.reduce((sum, p) => {
    const version = p.versions[0];
    if (!version) return sum;
    const min = version.investmentMin;
    const max = version.investmentMax;
    return sum + (min != null && max != null ? (min + max) / 2 : (min ?? max ?? 0));
  }, 0),
);
</script>

<template>
  <div>
    <UiPageHeader
      title="Proposals"
      description="What has been sent, what is outstanding, and how often proposals close."
    />

    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <UiStatCard label="Total proposals" :value="(proposals ?? []).length" />
        <UiStatCard label="Outstanding" :value="outstanding.length" />
        <UiStatCard
          label="Outstanding value"
          :value="formatCurrency(outstandingValue)"
        />
        <UiStatCard
          label="Close rate"
          :value="`${wonStep?.conversionFromPrevious ?? 0}%`"
          :sub="`${wonStep?.count ?? 0} of ${proposalStep?.count ?? 0} proposals`"
          :tone="(wonStep?.conversionFromPrevious ?? 0) >= 30 ? 'positive' : 'neutral'"
        />
      </div>

      <UiEmptyState
        v-if="(proposals ?? []).length === 0"
        title="No proposals yet"
        description="A proposal is drafted once a lead reaches Opportunity and the discovery call has been summarised."
      >
        <template #action>
          <NuxtLink to="/opportunities" class="text-sm text-accent hover:underline">
            Review opportunities
          </NuxtLink>
        </template>
      </UiEmptyState>

      <UiCard v-else>
        <UiCardHeader title="All proposals" />
        <UiCardBody class="p-0">
          <UiTable>
            <thead>
              <tr>
                <UiTh>Company</UiTh>
                <UiTh>Title</UiTh>
                <UiTh>Status</UiTh>
                <UiTh>Lead stage</UiTh>
                <UiTh class="text-right">Investment</UiTh>
                <UiTh class="text-right">Sent</UiTh>
              </tr>
            </thead>
            <tbody>
              <tr v-for="proposal in proposals" :key="proposal.id">
                <UiTd>
                  <NuxtLink
                    :to="`/leads/${proposal.lead.id}`"
                    class="hover:text-accent"
                  >
                    {{ proposal.company.name }}
                  </NuxtLink>
                </UiTd>
                <UiTd class="text-muted">
                  {{ proposal.title }}
                  <span v-if="proposal.versions[0]" class="ml-1 text-xs">
                    v{{ proposal.versions[0].version }}
                  </span>
                </UiTd>
                <UiTd>
                  <UiBadge :tone="STATUS_TONES[proposal.status] ?? 'neutral'">
                    {{ proposal.status.toLowerCase() }}
                  </UiBadge>
                </UiTd>
                <UiTd>
                  <UiBadge :tone="STAGE_TONES[proposal.lead.stage]">
                    {{ STAGE_LABELS[proposal.lead.stage] }}
                  </UiBadge>
                </UiTd>
                <UiTd class="text-right tabular-nums">
                  {{
                    proposal.versions[0]
                      ? formatRange(
                          proposal.versions[0].investmentMin,
                          proposal.versions[0].investmentMax,
                        )
                      : "—"
                  }}
                </UiTd>
                <UiTd class="text-right text-muted">
                  {{ proposal.sentAt ? relativeTime(proposal.sentAt) : "not sent" }}
                </UiTd>
              </tr>
            </tbody>
          </UiTable>
        </UiCardBody>
      </UiCard>
    </div>
  </div>
</template>
