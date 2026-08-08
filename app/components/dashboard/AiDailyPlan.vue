<script setup lang="ts">
/**
 * Port of `AiDailyPlan` from `src/components/dashboard/ai-suggestion.tsx`.
 *
 * The daily plan from the salesCoach agent (plan §28). It is labelled as AI
 * output everywhere it appears, and it is a suggestion: nothing here has been
 * actioned, and every item links to the screen where the user decides.
 *
 * React passed a server action to `<form action={…}>`; here the same `action`
 * prop is a plain async function invoked on submit. Reporting a failure is the
 * caller's job, exactly as it was when this was a server action.
 */
import { relativeTime } from "~/utils/format";
import type { DailyPlanRun } from "./api";

const props = defineProps<{
  run: DailyPlanRun | null;
  action: () => Promise<void>;
}>();

const sortedPriorities = computed(() =>
  [...(props.run?.data.priorities ?? [])].sort((a, b) => a.rank - b.rank),
);
</script>

<template>
  <UiCard>
    <UiCardHeader
      :description="
        run
          ? `Generated ${relativeTime(run.generatedAt)}${run.model ? ` by ${run.model}` : ''}. Review before acting.`
          : 'Not generated yet.'
      "
    >
      <template #title>
        <span class="flex items-center gap-2">
          Today&apos;s plan
          <UiBadge tone="accent">AI suggestion</UiBadge>
        </span>
      </template>
      <template #action>
        <form @submit.prevent="action()">
          <UiButton size="sm" variant="secondary" type="submit">
            {{ run ? "Regenerate" : "Generate" }}
          </UiButton>
        </form>
      </template>
    </UiCardHeader>
    <UiCardBody class="space-y-4">
      <p v-if="!run" class="text-sm text-muted">
        Generate a plan to see the highest-priority work for today, drawn from your
        goals, pipeline and overdue follow-ups.
      </p>
      <template v-else>
        <p class="text-sm font-medium">{{ run.data.headline }}</p>

        <ol v-if="run.data.priorities.length > 0" class="space-y-2">
          <li
            v-for="item in sortedPriorities"
            :key="`${item.rank}-${item.action}`"
            class="flex gap-3 text-sm"
          >
            <span
              class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[11px] font-medium tabular-nums text-muted"
            >
              {{ item.rank }}
            </span>
            <div class="min-w-0">
              <p>
                <NuxtLink
                  v-if="item.lead_id"
                  :to="`/leads/${item.lead_id}`"
                  class="text-accent hover:underline"
                >
                  {{ item.action }}
                </NuxtLink>
                <template v-else>{{ item.action }}</template>
              </p>
              <p class="text-xs text-muted">{{ item.reason }}</p>
            </div>
          </li>
        </ol>

        <div
          v-if="run.data.pipeline_observation"
          class="rounded-md border border-border bg-surface-muted p-3"
        >
          <p class="text-xs font-medium text-muted">Pipeline observation</p>
          <p class="mt-1 text-sm">{{ run.data.pipeline_observation }}</p>
        </div>

        <ul v-if="run.data.goal_status.length > 0" class="grid gap-1 sm:grid-cols-2">
          <li
            v-for="goal in run.data.goal_status"
            :key="goal.metric"
            class="text-xs text-muted"
          >
            <span class="font-medium text-foreground">{{ goal.metric }}</span>
            <span class="tabular-nums"> {{ goal.current }}/{{ goal.target }}</span>
            — {{ goal.comment }}
          </li>
        </ul>

        <div v-if="run.data.risks.length > 0">
          <p class="text-xs font-medium text-muted">Risks</p>
          <ul class="mt-1 list-inside list-disc space-y-0.5 text-xs text-muted">
            <li v-for="risk in run.data.risks" :key="risk">{{ risk }}</li>
          </ul>
        </div>
      </template>
    </UiCardBody>
  </UiCard>
</template>
