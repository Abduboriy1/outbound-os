<script setup lang="ts">
/**
 * Port of `src/app/(app)/opportunities/page.tsx`.
 *
 * Plan §11 — opportunities are the AI's argument for why a company should care:
 * a problem, the solution, and the evidence behind both. They are listed here
 * so the strongest ones can be worked first.
 *
 * GAP: the list came from `prisma.opportunity` and MIGRATION.md §4 exposes no
 * opportunities endpoint. It is fetched from `/api/opportunities`, the route
 * such an endpoint would occupy, and defaults to empty — so today the page
 * renders exactly the "No opportunities yet" state the source shows.
 */
import { formatRange, relativeTime } from "~/utils/format";
import { STAGE_LABELS, STAGE_TONES } from "~/components/dashboard/constants";
import type { Tone } from "~~/shared/tone";
import type { LeadStage } from "~~/server/generated/prisma/client";

type OpportunityRow = {
  id: string;
  title: string;
  problem: string;
  confidence: number;
  createdAt: string;
  estimatedValueMin: number | null;
  estimatedValueMax: number | null;
  company: { name: string; industry: string | null };
  lead: { id: string; stage: LeadStage; overallScore: number | null };
  roi: { prospectSupplied: boolean } | null;
};

const { data: opportunities } = await useFetch("/api/opportunities", {
  key: "opportunities-list",
  default: () => [] as OpportunityRow[],
  transform: (res) => (res as unknown as { data: OpportunityRow[] }).data,
});

function confidenceTone(confidence: number): Tone {
  if (confidence >= 0.7) return "positive";
  if (confidence >= 0.4) return "accent";
  return "neutral";
}
</script>

<template>
  <div>
    <UiPageHeader
      title="Opportunities"
      description="Problems worth solving, with the confidence and evidence behind each."
    />

    <UiEmptyState
      v-if="(opportunities ?? []).length === 0"
      title="No opportunities yet"
      description="Opportunities are generated once a lead has been researched. Work through the research queue to produce them."
    >
      <template #action>
        <NuxtLink to="/research/queue" class="text-sm text-accent hover:underline">
          Research queue
        </NuxtLink>
      </template>
    </UiEmptyState>

    <div v-else class="space-y-2">
      <UiCard v-for="opportunity in opportunities" :key="opportunity.id">
        <UiCardBody class="space-y-2">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <NuxtLink
                :to="`/opportunities/${opportunity.id}`"
                class="text-sm font-medium hover:text-accent"
              >
                {{ opportunity.title }}
              </NuxtLink>
              <p class="text-xs text-muted">
                <NuxtLink
                  :to="`/leads/${opportunity.lead.id}`"
                  class="hover:text-accent"
                >
                  {{ opportunity.company.name }}
                </NuxtLink>
                <template v-if="opportunity.company.industry">
                  · {{ opportunity.company.industry }}
                </template>
                · {{ relativeTime(opportunity.createdAt) }}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <UiBadge
                v-if="opportunity.roi"
                :tone="opportunity.roi.prospectSupplied ? 'positive' : 'warning'"
              >
                {{ opportunity.roi.prospectSupplied ? "ROI confirmed" : "ROI estimate" }}
              </UiBadge>
              <UiBadge :tone="STAGE_TONES[opportunity.lead.stage]">
                {{ STAGE_LABELS[opportunity.lead.stage] }}
              </UiBadge>
              <UiBadge :tone="confidenceTone(opportunity.confidence)">
                {{ Math.round(opportunity.confidence * 100) }}% confidence
              </UiBadge>
            </div>
          </div>

          <p class="line-clamp-2 text-sm text-muted">{{ opportunity.problem }}</p>

          <p class="text-xs text-muted">
            Estimated value
            {{
              formatRange(opportunity.estimatedValueMin, opportunity.estimatedValueMax)
            }}
          </p>
        </UiCardBody>
      </UiCard>
    </div>
  </div>
</template>
