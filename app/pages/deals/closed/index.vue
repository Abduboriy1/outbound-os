<script setup lang="ts">
/**
 * Port of `src/app/(app)/deals/closed/page.tsx`.
 * Plan §30 — what closed, for how much, and why the losses were lost.
 *
 * The source queried Prisma for `wonAt != null OR lostAt != null`. §4 has no
 * such filter, so the list comes from `/api/leads` restricted to the three
 * stages a closed lead can sit in and then filtered on the timestamps, which
 * gives the same rows for any lead whose stage and timestamps agree.
 * `computeRevenue` and the loss-reason breakdown come from `/api/analytics`,
 * which runs the very same functions server-side.
 */
import { formatCurrency } from "~/utils/format";
import { leadValue } from "~/components/dashboard/constants";
import type { AnalyticsResponse } from "~/components/dashboard/api";

type ClosedLead = {
  id: string;
  stage: string;
  createdAt: string;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  estimatedValueMin: number | null;
  estimatedValueMax: number | null;
  company: { name: string; industry: string | null };
};

const [{ data: leads }, { data: report }] = await Promise.all([
  useFetch("/api/leads", {
    key: "closed-leads",
    query: { stage: "WON,CUSTOMER,LOST", sort: "updated", dir: "desc" },
    transform: (res: { data: { leads: ClosedLead[] } }) => res.data.leads,
  }),
  useFetch("/api/analytics", {
    key: "closed-analytics",
    transform: (res: { data: AnalyticsResponse }) => res.data,
  }),
]);

const closed = computed(() =>
  (leads.value ?? [])
    .filter((lead) => lead.wonAt !== null || lead.lostAt !== null)
    .sort((a, b) => closedTime(b) - closedTime(a))
    .slice(0, 200),
);

function closedTime(lead: ClosedLead) {
  const at = lead.wonAt ?? lead.lostAt;
  return at ? new Date(at).getTime() : 0;
}

/** Days from creation to close, as the source computed it. */
function daysToClose(lead: ClosedLead) {
  const closedAt = lead.wonAt ?? lead.lostAt;
  if (!closedAt) return null;
  return Math.round(
    (new Date(closedAt).getTime() - new Date(lead.createdAt).getTime()) / 86_400_000,
  );
}

const revenue = computed(() => report.value?.revenue);
const lossReasons = computed(() => report.value?.lossReasons ?? []);
</script>

<template>
  <div>
    <UiPageHeader
      title="Won and lost"
      description="Closed deals, with the revenue they produced and the reasons the rest did not."
    />

    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <UiStatCard
          label="Won"
          :value="revenue?.wonCount ?? 0"
          :tone="(revenue?.wonCount ?? 0) > 0 ? 'positive' : 'neutral'"
        />
        <UiStatCard label="Won revenue" :value="formatCurrency(revenue?.wonRevenue)" />
        <UiStatCard label="Lost" :value="revenue?.lostCount ?? 0" />
        <UiStatCard
          label="Win rate"
          :value="`${revenue?.winRate ?? 0}%`"
          sub="Of everything that closed"
        />
        <UiStatCard
          label="Sales cycle"
          :value="
            revenue?.averageSalesCycleDays == null
              ? '—'
              : `${revenue.averageSalesCycleDays}d`
          "
        />
      </div>

      <UiEmptyState
        v-if="closed.length === 0"
        title="Nothing has closed yet"
        description="Deals appear here once a lead is marked won or lost from its workspace."
      />
      <template v-else>
        <UiCard>
          <UiCardHeader title="Closed deals" />
          <UiCardBody class="p-0">
            <UiTable>
              <thead>
                <tr>
                  <UiTh>Company</UiTh>
                  <UiTh>Industry</UiTh>
                  <UiTh>Outcome</UiTh>
                  <UiTh>Reason</UiTh>
                  <UiTh class="text-right">Value</UiTh>
                  <UiTh class="text-right">Days to close</UiTh>
                </tr>
              </thead>
              <tbody>
                <tr v-for="lead in closed" :key="lead.id">
                  <UiTd>
                    <NuxtLink :to="`/leads/${lead.id}`" class="hover:text-accent">
                      {{ lead.company.name }}
                    </NuxtLink>
                  </UiTd>
                  <UiTd class="text-muted">{{ lead.company.industry ?? "—" }}</UiTd>
                  <UiTd>
                    <UiBadge :tone="lead.wonAt ? 'positive' : 'danger'">
                      {{ lead.wonAt ? "Won" : "Lost" }}
                    </UiBadge>
                  </UiTd>
                  <UiTd class="max-w-[16rem] truncate text-muted">
                    {{ lead.lostReason ?? "—" }}
                  </UiTd>
                  <UiTd class="text-right tabular-nums">
                    {{ formatCurrency(leadValue(lead)) }}
                  </UiTd>
                  <UiTd class="text-right tabular-nums text-muted">
                    {{ daysToClose(lead) ?? "—" }}
                  </UiTd>
                </tr>
              </tbody>
            </UiTable>
          </UiCardBody>
        </UiCard>

        <UiCard v-if="lossReasons.length > 0">
          <UiCardHeader
            title="Why deals were lost"
            description="The most common reason is the first thing worth fixing."
          />
          <UiCardBody class="p-0">
            <UiTable>
              <thead>
                <tr>
                  <UiTh>Reason</UiTh>
                  <UiTh class="text-right">Deals</UiTh>
                  <UiTh class="text-right">Reached proposal</UiTh>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in lossReasons" :key="row.key">
                  <UiTd>{{ row.key }}</UiTd>
                  <UiTd class="text-right tabular-nums">{{ row.leads }}</UiTd>
                  <UiTd class="text-right tabular-nums text-muted">
                    {{ row.proposals }}
                  </UiTd>
                </tr>
              </tbody>
            </UiTable>
          </UiCardBody>
        </UiCard>
      </template>
    </div>
  </div>
</template>
