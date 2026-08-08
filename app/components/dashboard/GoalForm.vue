<script setup lang="ts">
/**
 * Port of `GoalForm` from `src/app/(app)/goals/goal-form.tsx`.
 *
 * `saveGoalAction` becomes `POST /api/goals` (MIGRATION.md §4), which runs the
 * same upsert on `userId_metric_period` and the same `snapshotGoalProgress`
 * call the action did. `useActionState`'s `[state, pending]` becomes two refs;
 * the error string is the server's own (§5.3).
 */
import type { GoalMetric, GoalPeriod } from "~~/server/generated/prisma/client";
import {
  GOAL_METRICS,
  GOAL_METRIC_LABELS,
  GOAL_PERIODS,
  PERIOD_LABELS,
} from "./constants";
import { errorMessage } from "./api";

const emit = defineEmits<{ saved: [] }>();

const metric = ref<GoalMetric>("OUTREACH_SENT");
const period = ref<GoalPeriod>("WEEKLY");
const target = ref("30");
const pending = ref(false);
const error = ref<string | undefined>();

async function submit() {
  pending.value = true;
  error.value = undefined;
  try {
    await $fetch("/api/goals", {
      method: "POST",
      body: {
        metric: metric.value,
        period: period.value,
        target: Number(target.value),
      },
    });
    emit("saved");
  } catch (e) {
    error.value = errorMessage(e, "Invalid goal");
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <form
    class="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
    @submit.prevent="submit"
  >
    <UiField label="Metric">
      <UiSelect v-model="metric" name="metric">
        <option v-for="m in GOAL_METRICS" :key="m" :value="m">
          {{ GOAL_METRIC_LABELS[m] }}
        </option>
      </UiSelect>
    </UiField>
    <UiField label="Period">
      <UiSelect v-model="period" name="period">
        <option v-for="p in GOAL_PERIODS" :key="p" :value="p">
          {{ PERIOD_LABELS[p] }}
        </option>
      </UiSelect>
    </UiField>
    <UiField label="Target" :error="error">
      <UiInput v-model="target" name="target" type="number" min="1" step="1" required />
    </UiField>
    <UiButton type="submit" variant="primary" :disabled="pending">
      {{ pending ? "Saving" : "Save goal" }}
    </UiButton>
  </form>
</template>
