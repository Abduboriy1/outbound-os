<script setup lang="ts">
/**
 * Port of `src/app/(app)/leads/[id]/opportunities/page.tsx`.
 * Read-only: opportunity generation belongs to the AI work stream.
 *
 * `GET /api/leads/:id/opportunities` is the source's query — opportunities by
 * confidence descending, each with its ROI row. `useFetch`, not `useAsyncData`
 * around a bare `$fetch`: see the note in `emails.vue`.
 */
import { computed } from "vue";
import type { Opportunity, RoiEstimate } from "~~/server/generated/prisma/client";

const route = useRoute();
const id = computed(() => String(route.params.id));

type OpportunityRow = Opportunity & { roi: RoiEstimate | null };

const { data: opportunities } = await useFetch(
  () => `/api/leads/${id.value}/opportunities`,
  {
    transform: (res: { data: OpportunityRow[] }) => res.data,
    default: () => [] as OpportunityRow[],
    watch: [id],
  },
);
</script>

<template>
  <UiEmptyState
    v-if="opportunities.length === 0"
    title="No opportunities identified"
    description="Opportunities appear once the opportunity agent has analysed the research for this lead."
  />

  <div v-else class="space-y-4">
    <UiCard v-for="opportunity in opportunities" :key="opportunity.id">
      <UiCardHeader
        :title="opportunity.title"
        :description="`${opportunity.status.toLowerCase()} · ${formatRange(opportunity.estimatedValueMin, opportunity.estimatedValueMax)}`"
      >
        <template #action>
          <UiBadge tone="accent">
            confidence {{ Math.round(opportunity.confidence * 100) }}%
          </UiBadge>
        </template>
      </UiCardHeader>
      <UiCardBody class="space-y-3 text-sm">
        <div>
          <p class="text-xs font-medium text-muted">Problem</p>
          <p class="whitespace-pre-wrap">{{ opportunity.problem }}</p>
        </div>
        <div>
          <p class="text-xs font-medium text-muted">Solution</p>
          <p class="whitespace-pre-wrap">{{ opportunity.solution }}</p>
        </div>
        <div v-if="opportunity.benefit">
          <p class="text-xs font-medium text-muted">Benefit</p>
          <p class="whitespace-pre-wrap">{{ opportunity.benefit }}</p>
        </div>
        <p v-if="opportunity.roi" class="text-xs text-muted">
          ROI inputs: {{ opportunity.roi.employees }} people,
          {{ opportunity.roi.hoursPerWeek }} hours per week at
          {{ opportunity.roi.hourlyCost }} per hour{{
            opportunity.roi.prospectSupplied
              ? " (supplied by the prospect)"
              : " (estimated)"
          }}
        </p>
      </UiCardBody>
    </UiCard>
  </div>
</template>
