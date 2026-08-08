<script setup lang="ts">
/**
 * Port of `src/components/research/report-view.tsx`.
 *
 * Research report renderer (plan §9).
 *
 * Claims are grouped FACT / INFERENCE / UNKNOWN and every one shows the source
 * it came from, because the whole point of the report is that a human can check
 * it. An inference is never styled like a fact.
 *
 * Props are deliberately minimal — `{ reportId }` or `{ leadId }` — so the lead
 * workspace can drop it in without knowing how research is stored. The React
 * version was a server component querying Prisma; this reads
 * `GET /api/research/:reportId`, resolving `leadId` to the newest report first.
 */
import { computed } from "vue";
import type { ClaimType } from "~~/server/generated/prisma/client";
import type { Tone } from "~~/shared/tone";
import UiBadge from "~/components/ui/UiBadge.vue";
import UiCard from "~/components/ui/UiCard.vue";
import UiCardBody from "~/components/ui/UiCardBody.vue";
import UiCardHeader from "~/components/ui/UiCardHeader.vue";
import UiEmptyState from "~/components/ui/UiEmptyState.vue";
import type {
  ResearchClaim,
  ResearchListRow,
  ResearchReportDetail,
  ResearchSource,
} from "./types";

const props = withDefaults(
  defineProps<{
    reportId?: string;
    leadId?: string;
    /** Hides the source list when the surrounding page already shows it. */
    compact?: boolean;
  }>(),
  { reportId: undefined, leadId: undefined, compact: false },
);

const CLAIM_TYPES: ClaimType[] = ["FACT", "INFERENCE", "UNKNOWN"];

const CLAIM_TONES: Record<ClaimType, Tone> = {
  FACT: "positive",
  INFERENCE: "warning",
  UNKNOWN: "neutral",
};

const CLAIM_BLURB: Record<ClaimType, string> = {
  FACT: "Stated in a source. Safe to reference in conversation.",
  INFERENCE: "Concluded from a source. Ask about it, do not assert it.",
  UNKNOWN: "Not answered by the sources. Worth asking on a call.",
};

const STATUS_TONES: Record<string, Tone> = {
  PENDING: "neutral",
  RUNNING: "accent",
  COMPLETE: "positive",
  FAILED: "danger",
};

/**
 * Two chained requests, so this is `useAsyncData` rather than `useFetch` — but
 * it must issue them with `useRequestFetch()`, not bare `$fetch`. `$fetch`
 * forwards no headers on the server, so during SSR both calls arrived without
 * `ase_session` and came back 401; the report rendered its empty state on
 * every hard load (MIGRATION.md §5.1). `useRequestFetch()` has to be resolved
 * here in setup, not inside the handler.
 */
const request = useRequestFetch();

const { data: report } = await useAsyncData<ResearchReportDetail | null>(
  `research-report:${props.reportId ?? ""}:${props.leadId ?? ""}`,
  async () => {
    let id = props.reportId;
    if (!id && props.leadId) {
      // `orderBy: createdAt desc` server-side, so the first row is the newest.
      const list = await request<{ data: ResearchListRow[] }>("/api/research", {
        query: { leadId: props.leadId, limit: 1 },
      });
      id = list.data[0]?.id;
    }
    if (!id) return null;
    const result = await request<{ data: ResearchReportDetail }>(
      `/api/research/${id}`,
    );
    return result.data;
  },
  { default: () => null },
);

const sourceById = computed(() => {
  const map = new Map<string, ResearchSource>();
  for (const source of report.value?.sources ?? []) map.set(source.id, source);
  return map;
});

/** The endpoint orders claims by `createdAt`; the source ordered by confidence. */
const grouped = computed<Record<ClaimType, ResearchClaim[]>>(() => {
  const claims = report.value?.claims ?? [];
  const byConfidence = [...claims].sort((a, b) => b.confidence - a.confidence);
  return {
    FACT: byConfidence.filter((claim) => claim.type === "FACT"),
    INFERENCE: byConfidence.filter((claim) => claim.type === "INFERENCE"),
    UNKNOWN: byConfidence.filter((claim) => claim.type === "UNKNOWN"),
  };
});

const headerDescription = computed(() => {
  const value = report.value;
  if (!value) return "";
  if (!value.completedAt) return `Status ${value.status.toLowerCase()}`;
  const count = value.sources.length;
  return `Completed ${relativeTime(value.completedAt)} · ${count} source${count === 1 ? "" : "s"} · ${value.model ?? "unknown model"}`;
});

function claimSource(claim: ResearchClaim) {
  return claim.sourceId ? (sourceById.value.get(claim.sourceId) ?? null) : null;
}
</script>

<template>
  <UiEmptyState
    v-if="!report"
    title="No research yet"
    description="Run research on this lead to build a sourced company intelligence report."
  />

  <div v-else class="space-y-4">
    <UiCard>
      <UiCardHeader
        :title="`Research: ${report.company.name}`"
        :description="headerDescription"
      >
        <template #action>
          <div class="flex items-center gap-2">
            <UiBadge v-if="report.confidence != null" tone="neutral">
              Confidence {{ Math.round(report.confidence * 100) }}%
            </UiBadge>
            <UiBadge :tone="STATUS_TONES[report.status] ?? 'neutral'">
              {{ report.status }}
            </UiBadge>
          </div>
        </template>
      </UiCardHeader>
      <UiCardBody class="space-y-3">
        <p
          v-if="report.error"
          class="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {{ report.error }}
        </p>
        <p v-if="report.summary" class="text-sm leading-relaxed">
          {{ report.summary }}
        </p>
        <p v-else class="text-sm text-muted">No summary was produced.</p>
        <ul v-if="report.warnings.length" class="space-y-1 text-xs text-warning">
          <li v-for="warning in report.warnings" :key="warning">{{ warning }}</li>
        </ul>
      </UiCardBody>
    </UiCard>

    <UiCard v-for="type in CLAIM_TYPES" :key="type">
      <UiCardHeader :description="CLAIM_BLURB[type]">
        <template #title>
          <span class="flex items-center gap-2">
            <UiBadge :tone="CLAIM_TONES[type]">{{ type }}</UiBadge>
            <span class="text-muted">{{ grouped[type].length }}</span>
          </span>
        </template>
      </UiCardHeader>
      <UiCardBody>
        <p v-if="grouped[type].length === 0" class="text-sm text-muted">
          Nothing recorded.
        </p>
        <ul v-else class="space-y-3">
          <li
            v-for="claim in grouped[type]"
            :key="claim.id"
            class="border-l-2 border-border pl-3"
          >
            <p class="text-sm">{{ claim.text }}</p>
            <p class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span v-if="claim.category">{{ claim.category }}</span>
              <span>·</span>
              <span>{{ Math.round(claim.confidence * 100) }}% confidence</span>
              <span>·</span>
              <a
                v-if="claimSource(claim)?.url"
                :href="claimSource(claim)!.url!"
                target="_blank"
                rel="noreferrer noopener"
                class="text-accent underline-offset-2 hover:underline"
              >
                {{ claimSource(claim)!.title ?? claimSource(claim)!.url }}
              </a>
              <span v-else>
                {{ claimSource(claim)?.title ?? "no source recorded" }}
              </span>
            </p>
          </li>
        </ul>
      </UiCardBody>
    </UiCard>

    <UiCard v-if="report.signals.length">
      <UiCardHeader
        title="Pain signals"
        description="Detected by keyword rules and by the research agent. Each keeps the sentence it came from."
      />
      <UiCardBody>
        <ul class="space-y-3">
          <li
            v-for="(signal, index) in report.signals.slice(0, 20)"
            :key="`${signal.type}-${index}`"
            class="border-l-2 border-border pl-3"
          >
            <p class="flex items-center gap-2 text-xs">
              <UiBadge :tone="signal.family === 'PAIN' ? 'warning' : 'accent'">
                {{ signal.label }}
              </UiBadge>
              <span class="text-muted">
                {{ signal.origin === "RULE" ? "keyword match" : "agent" }}
              </span>
            </p>
            <p class="mt-1 text-sm italic">{{ signal.evidence }}</p>
            <p class="mt-0.5 text-xs text-muted">{{ signal.sourceLabel }}</p>
          </li>
        </ul>
      </UiCardBody>
    </UiCard>

    <UiCard v-if="!compact">
      <UiCardHeader
        title="Sources"
        description="Everything the analysis was allowed to read."
      />
      <UiCardBody>
        <p v-if="report.sources.length === 0" class="text-sm text-muted">
          No sources were retrieved.
        </p>
        <ul v-else class="space-y-2">
          <li v-for="source in report.sources" :key="source.id" class="text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <UiBadge tone="neutral">{{ source.kind }}</UiBadge>
              <a
                v-if="source.url"
                :href="source.url"
                target="_blank"
                rel="noreferrer noopener"
                class="text-accent underline-offset-2 hover:underline"
              >
                {{ source.title ?? source.url }}
              </a>
              <span v-else>{{ source.title ?? "untitled" }}</span>
              <span class="text-xs text-muted">
                retrieved {{ relativeTime(source.retrievedAt) }}
              </span>
            </div>
          </li>
        </ul>
      </UiCardBody>
    </UiCard>
  </div>
</template>
