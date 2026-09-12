<script setup lang="ts">
/**
 * Port of `src/app/(app)/research/queue/page.tsx`.
 *
 *   - the report list  → `GET /api/research?limit=100`
 *   - `lead.overallScore` → `GET /api/leads`, joined by id
 *   - `queueStatus()`  → `GET /api/queue`
 *
 * `getCurrentUser()` + `redirect("/login")` is handled by
 * `app/middleware/auth.global.ts` (MIGRATION.md §4.4).
 */
import { computed } from "vue";
import {
  rerunResearchAction,
  rescoreLeadAction,
} from "~/components/research/actions";
import type {
  QueueStatus,
  ResearchListRow,
} from "~/components/research/types";
import {
  RESEARCH_STATUS_HINTS,
  RESEARCH_STATUS_ORDER as STATUS_ORDER,
  statusTone,
} from "~/components/research/status";
import type { LeadListRow } from "~/components/outreach/types";

const { data: reports, refresh: refreshReports } = await useFetch("/api/research", {
  query: { limit: 100 },
  transform: (res: { data: ResearchListRow[] }) => res.data,
  default: () => [] as ResearchListRow[],
});

const { data: leads, refresh: refreshLeads } = await useFetch("/api/leads", {
  transform: (res: { data: { leads: LeadListRow[]; total: number } }) =>
    res.data.leads,
  default: () => [] as LeadListRow[],
});

const { data: queue } = await useFetch("/api/queue", {
  transform: (res: { data: QueueStatus }) => res.data,
});

const scoreByLead = computed(() => {
  const map = new Map<string, number | null>();
  for (const lead of leads.value) map.set(lead.id, lead.overallScore);
  return map;
});

/** `Array.prototype.sort` is stable, so newest-first survives the regroup. */
const rows = computed(() =>
  [...reports.value].sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status as (typeof STATUS_ORDER)[number]) -
      STATUS_ORDER.indexOf(b.status as (typeof STATUS_ORDER)[number]),
  ),
);

const counts = computed(() => {
  const acc: Record<string, number> = {};
  for (const status of STATUS_ORDER) {
    acc[status] = rows.value.filter((row) => row.status === status).length;
  }
  return acc;
});

const research = computed(() => queue.value?.counts.research ?? null);

/**
 * Redis up, jobs waiting, nothing active: the API enqueued successfully and no
 * `npm run worker` process is consuming the queue, so every report sits at
 * PENDING forever. The inline fallback only covers an unreachable Redis, which
 * is why this cannot be inferred from the "queued / inline" badge alone.
 */
const workerIdle = computed(
  () =>
    Boolean(queue.value?.redis) &&
    (research.value?.waiting ?? 0) > 0 &&
    (research.value?.active ?? 0) === 0,
);

/** Per-lead progress through the pipeline stages of plan §32. */
function steps(row: ResearchListRow) {
  return [
    { label: "sources", value: row._count.sources },
    { label: "claims", value: row._count.claims },
    { label: "signals", value: row.signals },
    { label: "opportunities", value: row.opportunities },
    { label: "people", value: row.people },
  ];
}

async function rerun(reportId: string) {
  await rerunResearchAction(reportId);
  await Promise.all([refreshReports(), refreshLeads()]);
}

async function rescore(leadId: string) {
  await rescoreLeadAction(leadId);
  await Promise.all([refreshReports(), refreshLeads()]);
}
</script>

<template>
  <div>
    <UiPageHeader
      title="Research queue"
      description="Every research report, newest first. Re-run any of them; the report is rewritten in place."
    />

    <div class="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <UiStatCard label="Complete" :value="counts.COMPLETE ?? 0" tone="positive" />
      <UiStatCard label="Running" :value="counts.RUNNING ?? 0" tone="accent" />
      <UiStatCard
        label="Pending"
        :value="counts.PENDING ?? 0"
        :tone="counts.PENDING ? 'warning' : 'neutral'"
      />
      <UiStatCard
        label="Failed"
        :value="counts.FAILED ?? 0"
        :tone="counts.FAILED ? 'danger' : 'neutral'"
      />
    </div>

    <UiCard class="mb-5">
      <UiCardHeader
        title="Workers"
        :description="
          queue?.redis
            ? 'Redis is connected; research runs on the queue.'
            : 'Redis is not reachable, so jobs run inline inside the request. Everything still works, it is just slower.'
        "
      >
        <template #action>
          <UiBadge :tone="workerIdle ? 'danger' : queue?.redis ? 'positive' : 'warning'">
            {{ workerIdle ? "no worker" : queue?.redis ? "queued" : "inline" }}
          </UiBadge>
        </template>
      </UiCardHeader>
      <UiCardBody class="space-y-2">
        <p
          v-if="workerIdle"
          class="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning"
        >
          {{ research?.waiting }} job{{ research?.waiting === 1 ? "" : "s" }} are waiting
          and nothing is consuming them, so reports stay PENDING. Start the worker with
          <code class="font-mono">npm run worker</code>.
        </p>
        <p v-if="research" class="text-sm text-muted">
          {{ research.waiting }} waiting · {{ research.active }} active ·
          {{ research.failed }} failed
        </p>
      </UiCardBody>
    </UiCard>

    <UiEmptyState
      v-if="rows.length === 0"
      title="No research has been run yet"
      description="Open a lead and start research, or enqueue it from the API."
    />
    <UiCard v-else>
      <UiTable>
        <thead>
          <tr>
            <UiTh>Company</UiTh>
            <UiTh>Status</UiTh>
            <UiTh>Progress</UiTh>
            <UiTh>Score</UiTh>
            <UiTh>Updated</UiTh>
            <UiTh />
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <UiTd>
              <NuxtLink
                :to="`/leads/${row.leadId}`"
                class="font-medium underline-offset-2 hover:underline"
              >
                {{ row.company.name }}
              </NuxtLink>
              <p class="text-xs text-muted">{{ row.model ?? "no model recorded" }}</p>
              <p v-if="row.error" class="mt-1 max-w-md text-xs text-danger">
                {{ row.error }}
              </p>
              <p
                v-for="warning in row.warnings.slice(0, 2)"
                :key="warning"
                class="mt-1 max-w-md text-xs text-warning"
              >
                {{ warning }}
              </p>
            </UiTd>
            <UiTd>
              <UiBadge :tone="statusTone(row.status)" :title="RESEARCH_STATUS_HINTS[row.status]">
                {{ row.status }}
              </UiBadge>
            </UiTd>
            <UiTd class="text-xs text-muted">
              <span class="flex flex-wrap gap-x-3 gap-y-1">
                <span
                  v-for="step in steps(row)"
                  :key="step.label"
                  :class="step.value ? 'text-foreground' : undefined"
                >
                  <span class="tabular-nums">{{ step.value ?? "—" }}</span>
                  {{ step.label }}
                </span>
              </span>
            </UiTd>
            <UiTd class="tabular-nums">
              {{ scoreByLead.get(row.leadId) ?? "—" }}
              <span v-if="row.confidence != null" class="ml-1 text-xs text-muted">
                ({{ Math.round(row.confidence * 100) }}%)
              </span>
            </UiTd>
            <UiTd class="text-xs text-muted">
              {{ relativeTime(row.completedAt ?? row.startedAt ?? row.createdAt) }}
            </UiTd>
            <UiTd>
              <div class="flex justify-end gap-2">
                <form @submit.prevent="rerun(row.id)">
                  <UiButton size="sm" type="submit" :disabled="row.status === 'RUNNING'">
                    Re-run
                  </UiButton>
                </form>
                <form @submit.prevent="rescore(row.leadId)">
                  <UiButton size="sm" variant="ghost" type="submit">Rescore</UiButton>
                </form>
              </div>
            </UiTd>
          </tr>
        </tbody>
      </UiTable>
    </UiCard>
  </div>
</template>
