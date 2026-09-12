<script setup lang="ts">
/**
 * Research tab: the selected run's report plus the lead's run history.
 *
 * Every run is kept (`POST /api/research` creates a new report row), so the
 * rail on the right lists them newest-first and clicking one replays it —
 * including its step log — through the same `ResearchReportView` the queue
 * uses. The view re-mounts per selection (`:key`), which is what re-triggers
 * its data fetch.
 */
import { computed, ref } from "vue";
import ResearchReportView from "~/components/research/ResearchReportView.vue";
import { RESEARCH_STATUS_HINTS, statusTone } from "~/components/research/status";
import type { ResearchListRow } from "~/components/research/types";

const route = useRoute();
const id = computed(() => String(route.params.id));

const { data: runs, refresh: refreshRuns } = await useFetch("/api/research", {
  query: computed(() => ({ leadId: id.value, limit: 50 })),
  transform: (res: { data: ResearchListRow[] }) => res.data,
  default: () => [] as ResearchListRow[],
  watch: [id],
});

/** null = newest; the view resolves `leadId` to the latest report itself. */
const selectedId = ref<string | null>(null);

const selectedRun = computed(
  () => runs.value.find((run) => run.id === selectedId.value) ?? runs.value[0] ?? null,
);

/** Re-runs and settled runs change the rows (status, counts), so refetch. */
async function onUpdated() {
  await refreshRuns();
}

function runCaption(run: ResearchListRow) {
  const parts = [
    `${run._count.sources} src`,
    `${run._count.claims} claims`,
    `${run.signals} sig`,
  ];
  if (run.people) parts.push(`${run.people} people`);
  return parts.join(" · ");
}
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[1fr_260px]">
    <div class="min-w-0 space-y-4">
      <ResearchReportView
        :key="selectedRun?.id ?? 'none'"
        :report-id="selectedRun?.id"
        :lead-id="id"
        @updated="onUpdated"
      />
      <p class="text-xs text-muted">
        Research runs as a background job; this view polls until it finishes.
        <NuxtLink to="/research/queue" class="text-accent">The research queue</NuxtLink>
        shows every run and its worker state.
      </p>
    </div>

    <UiCard v-if="runs.length" class="self-start">
      <UiCardHeader
        title="History"
        :description="`${runs.length} run${runs.length === 1 ? '' : 's'}, newest first.`"
      />
      <UiCardBody class="p-0">
        <ul>
          <li v-for="run in runs" :key="run.id">
            <button
              type="button"
              class="block w-full px-4 py-2.5 text-left transition hover:bg-surface-muted"
              :class="run.id === selectedRun?.id ? 'bg-surface-muted' : undefined"
              @click="selectedId = run.id"
            >
              <span class="flex items-center justify-between gap-2">
                <span class="text-xs font-medium">
                  {{ relativeTime(run.completedAt ?? run.startedAt ?? run.createdAt) }}
                </span>
                <UiBadge
                  :tone="statusTone(run.status)"
                  :title="RESEARCH_STATUS_HINTS[run.status]"
                >
                  {{ run.status }}
                </UiBadge>
              </span>
              <span class="mt-0.5 block text-xs text-muted">{{ runCaption(run) }}</span>
            </button>
          </li>
        </ul>
      </UiCardBody>
    </UiCard>
  </div>
</template>
