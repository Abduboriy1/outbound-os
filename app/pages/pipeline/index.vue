<script setup lang="ts">
/**
 * Port of `src/app/(app)/pipeline/page.tsx`.
 *
 * `leadsByStage(user.id, PIPELINE_STAGES)` becomes one `/api/leads` call
 * restricted to the pipeline stages, grouped in the browser in the same order.
 * `changeStageAction` becomes `POST /api/leads/:id/stage` inside
 * `DashboardStageMoveForm`; `revalidatePath` becomes `refresh()`.
 */
import { PIPELINE_STAGES, STAGE_LABELS } from "~/components/dashboard/constants";
import type { BoardLead } from "~/components/dashboard/LeadCardSummary.vue";
import type { LeadStage } from "~~/server/generated/prisma/client";

const { data: leads, refresh } = await useFetch("/api/leads", {
  key: "pipeline-board",
  query: { stage: PIPELINE_STAGES.join(","), sort: "score", dir: "desc" },
  transform: (res: { data: { leads: BoardLead[] } }) => res.data.leads,
});

const board = computed(() => {
  const grouped = new Map<LeadStage, BoardLead[]>();
  for (const stage of PIPELINE_STAGES) grouped.set(stage, []);
  for (const lead of leads.value ?? []) grouped.get(lead.stage)?.push(lead);
  return grouped;
});

const total = computed(() =>
  PIPELINE_STAGES.reduce((sum, stage) => sum + (board.value.get(stage)?.length ?? 0), 0),
);
</script>

<template>
  <div>
    <UiPageHeader
      title="Pipeline"
      :description="`${total} lead${total === 1 ? '' : 's'} across the working pipeline. Stage moves are recorded with a reason.`"
    >
      <template #action>
        <div class="flex gap-2">
          <NuxtLink to="/leads">
            <UiButton>Table view</UiButton>
          </NuxtLink>
          <NuxtLink to="/leads/new">
            <UiButton variant="primary">New lead</UiButton>
          </NuxtLink>
        </div>
      </template>
    </UiPageHeader>

    <div class="overflow-x-auto pb-4">
      <ul class="flex min-w-max gap-3">
        <li v-for="stage in PIPELINE_STAGES" :key="stage" class="w-72 shrink-0">
          <div class="mb-2 flex items-center justify-between gap-2">
            <h2 class="text-sm font-medium">{{ STAGE_LABELS[stage] }}</h2>
            <UiBadge>{{ board.get(stage)?.length ?? 0 }}</UiBadge>
          </div>
          <div class="space-y-2">
            <p
              v-if="(board.get(stage)?.length ?? 0) === 0"
              class="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted"
            >
              Empty
            </p>
            <UiCard
              v-for="lead in board.get(stage) ?? []"
              v-else
              :key="lead.id"
              class="p-3"
            >
              <DashboardLeadCardSummary :lead="lead" />
              <DashboardBoardStageMove
                :lead-id="lead.id"
                :current-stage="lead.stage"
                @moved="refresh()"
              />
            </UiCard>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
