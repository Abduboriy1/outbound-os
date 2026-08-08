<script setup lang="ts">
/**
 * Port of `src/app/(app)/research/signals/page.tsx`.
 *
 * The Prisma query read `payload.signals` straight out of each report row.
 * `GET /api/research?include=signals` does the same — `signalDetails` carries
 * the signals themselves alongside the counts, so one request replaces the
 * report-per-request fan-out this page used to run.
 *
 * `searchParams` becomes `route.query`, and `getCurrentUser()` +
 * `redirect("/login")` is handled by `app/middleware/auth.global.ts`.
 */
import { computed } from "vue";
import type { Tone } from "~~/shared/tone";
import type {
  DetectedSignal,
  ResearchListRow,
} from "~/components/research/types";

const FAMILY_TONES: Record<DetectedSignal["family"], Tone> = {
  PAIN: "warning",
  HIRING: "accent",
  GROWTH: "positive",
  TRIGGER: "accent",
};

const FAMILIES = ["PAIN", "HIRING", "GROWTH", "TRIGGER"] as const;

type Row = DetectedSignal & {
  leadId: string;
  companyName: string;
  detectedAt: string;
};

const route = useRoute();
const typeFilter = computed(() =>
  route.query.type ? String(route.query.type) : undefined,
);
const familyFilter = computed(() =>
  route.query.family ? String(route.query.family) : undefined,
);

const { data: rows } = await useFetch("/api/research", {
  key: "research-signals",
  query: { status: "COMPLETE", limit: 100, include: "signals" },
  transform: (res: { data: ResearchListRow[] }) => {
    // One report per lead — the newest. Older reports would double-count the
    // same evidence and make the counts meaningless. The list is already
    // newest-first, so the first row for a lead is the one to keep.
    const seenLeads = new Set<string>();
    const collected: Row[] = [];
    for (const report of res.data) {
      if (seenLeads.has(report.leadId)) continue;
      seenLeads.add(report.leadId);
      for (const signal of report.signalDetails ?? []) {
        collected.push({
          ...signal,
          leadId: report.leadId,
          companyName: report.company.name,
          detectedAt: report.completedAt ?? report.createdAt,
        });
      }
    }
    return collected;
  },
  default: () => [] as Row[],
});

/**
 * `SIGNAL_LABELS` lives in `server/lib/research/signals.ts` and cannot be
 * imported at runtime. Every detected signal already carries the same `label`
 * the map would have produced, so the counts are keyed off the rows.
 */
const typeCounts = computed(() => {
  const counts = new Map<string, { label: string; count: number }>();
  for (const row of rows.value) {
    const entry = counts.get(row.type);
    if (entry) entry.count += 1;
    else counts.set(row.type, { label: row.label, count: 1 });
  }
  return [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
});

function familyCount(family: string) {
  return rows.value.filter((row) => row.family === family).length;
}

const filtered = computed(() =>
  rows.value.filter(
    (row) =>
      (!typeFilter.value || row.type === typeFilter.value) &&
      (!familyFilter.value || row.family === familyFilter.value),
  ),
);

const leadsWithSignals = computed(
  () => new Set(rows.value.map((row) => row.leadId)).size,
);

const painCount = computed(
  () => rows.value.filter((row) => row.family === "PAIN").length,
);

const chipClass = (active: boolean) =>
  cn(
    "rounded-md border px-2 py-1 text-xs transition",
    active
      ? "border-accent bg-accent-soft text-accent"
      : "border-border text-muted hover:bg-surface-muted",
  );
</script>

<template>
  <div>
    <UiPageHeader
      title="Signals"
      description="Evidence of a solvable problem, detected across every researched company. Each signal keeps the sentence and the page it came from."
    />

    <div class="mb-5 grid gap-3 sm:grid-cols-3">
      <UiStatCard label="Signals" :value="rows.length" />
      <UiStatCard label="Pain signals" :value="painCount" tone="warning" />
      <UiStatCard label="Companies with signals" :value="leadsWithSignals" />
    </div>

    <UiCard class="mb-5">
      <UiCardHeader
        title="Filter"
        description="By signal type. Counts are across the newest report for each company."
      />
      <UiCardBody class="flex flex-wrap gap-2">
        <NuxtLink
          to="/research/signals"
          :class="chipClass(!typeFilter && !familyFilter)"
        >
          All ({{ rows.length }})
        </NuxtLink>
        <NuxtLink
          v-for="family in FAMILIES"
          :key="family"
          :to="`/research/signals?family=${family}`"
          :class="chipClass(familyFilter === family)"
        >
          {{ family.toLowerCase() }} ({{ familyCount(family) }})
        </NuxtLink>
        <NuxtLink
          v-for="[type, entry] in typeCounts"
          :key="type"
          :to="`/research/signals?type=${type}`"
          :class="chipClass(typeFilter === type)"
        >
          {{ entry.label }} ({{ entry.count }})
        </NuxtLink>
      </UiCardBody>
    </UiCard>

    <UiEmptyState
      v-if="filtered.length === 0"
      title="No signals to show"
      :description="
        rows.length === 0
          ? 'Run research on a lead — signals are detected from the pages it retrieves.'
          : 'No signal matches this filter.'
      "
    />
    <div v-else class="space-y-3">
      <UiCard
        v-for="(row, index) in filtered.slice(0, 300)"
        :key="`${row.leadId}-${row.type}-${index}`"
      >
        <UiCardBody class="space-y-1.5">
          <div class="flex flex-wrap items-center gap-2">
            <UiBadge :tone="FAMILY_TONES[row.family]">{{ row.label }}</UiBadge>
            <NuxtLink
              :to="`/leads/${row.leadId}`"
              class="text-sm font-medium underline-offset-2 hover:underline"
            >
              {{ row.companyName }}
            </NuxtLink>
            <span class="text-xs text-muted">
              {{
                row.origin === "RULE"
                  ? `matched "${row.keyword}"`
                  : "detected by the agent"
              }}
            </span>
            <span class="text-xs text-muted">· {{ relativeTime(row.detectedAt) }}</span>
          </div>
          <p class="text-sm italic">{{ row.evidence }}</p>
          <p class="text-xs text-muted">
            <a
              v-if="row.sourceUrl"
              :href="row.sourceUrl"
              target="_blank"
              rel="noreferrer noopener"
              class="text-accent underline-offset-2 hover:underline"
            >
              {{ row.sourceLabel }}
            </a>
            <template v-else>{{ row.sourceLabel }}</template>
          </p>
        </UiCardBody>
      </UiCard>
    </div>
  </div>
</template>
