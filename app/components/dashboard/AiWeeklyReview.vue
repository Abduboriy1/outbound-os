<script setup lang="ts">
/**
 * Port of `AiWeeklyReview` from `src/components/dashboard/weekly-review.tsx`.
 * Plan §29 — the weekly review, clearly marked as AI output.
 *
 * The private `Section` and `Field` helpers are inlined as local components in
 * `AiWeeklyReviewSection.vue` / `AiWeeklyReviewField.vue`, so the rendered
 * markup and the "render nothing when empty" rule are unchanged.
 */
import { relativeTime } from "~/utils/format";
import type { WeeklyReviewRun } from "./api";

defineProps<{
  run: WeeklyReviewRun | null;
  action: () => Promise<void>;
}>();
</script>

<template>
  <UiCard>
    <UiCardHeader
      :description="
        run
          ? `Generated ${relativeTime(run.generatedAt)}${run.model ? ` by ${run.model}` : ''}. Every claim should be checkable against the tables below.`
          : 'Not generated for this week yet.'
      "
    >
      <template #title>
        <span class="flex items-center gap-2">
          Weekly review
          <UiBadge tone="accent">AI suggestion</UiBadge>
        </span>
      </template>
      <template #action>
        <form @submit.prevent="action()">
          <UiButton size="sm" type="submit">{{ run ? "Regenerate" : "Generate" }}</UiButton>
        </form>
      </template>
    </UiCardHeader>
    <UiCardBody class="space-y-4">
      <p v-if="!run" class="text-sm text-muted">
        Turns this week&apos;s figures into what worked, what did not, and what to
        change next week.
      </p>
      <div v-else class="grid gap-4 md:grid-cols-2">
        <DashboardAiWeeklyReviewSection
          title="What worked"
          :items="run.data.what_worked"
        />
        <DashboardAiWeeklyReviewSection
          title="What did not"
          :items="run.data.what_did_not_work"
        />
        <DashboardAiWeeklyReviewField
          label="Best performing ICP"
          :value="run.data.best_icp"
        />
        <DashboardAiWeeklyReviewField
          label="Industries that responded"
          :value="run.data.responsive_industries.join(', ')"
        />
        <DashboardAiWeeklyReviewSection
          title="Messages that produced replies"
          :items="run.data.messages_that_produced_replies"
        />
        <DashboardAiWeeklyReviewField
          label="Where deals stalled"
          :value="run.data.where_deals_stalled"
        />
        <DashboardAiWeeklyReviewField
          label="Most common objection"
          :value="run.data.most_common_objection"
        />
        <div class="md:col-span-2">
          <DashboardAiWeeklyReviewSection
            title="Change next week"
            :items="run.data.changes_for_next_week"
            emphasis
          />
        </div>
      </div>
    </UiCardBody>
  </UiCard>
</template>
