<script setup lang="ts">
/**
 * Port of `src/app/(app)/goals/page.tsx`.
 *
 * Plan §6 — measurable goals whose progress the application calculates itself.
 * Nothing on this page is typed in by the user except the target.
 *
 * Actions map onto §4 as:
 *   saveGoalAction            → POST /api/goals
 *   archiveGoalAction         → POST /api/goals { …, isActive: false }
 *   reactivateGoalAction      → POST /api/goals { …, isActive: true }
 *   refreshGoalProgressAction → POST /api/goals/snapshot
 *
 * GAP: the archived-goal list and the closed-period history came from
 * `prisma.goal` / `prisma.goalProgress` directly, and `/api/goals` only returns
 * active goals. Both are fetched from the routes such endpoints would occupy
 * and default to empty, so today the page renders exactly as it does for a user
 * with no archive and no closed periods. The archive/reactivate buttons already
 * write through the real endpoint.
 */
import type { GoalMetric, GoalPeriod } from "~~/server/generated/prisma/client";
import {
  GOAL_METRIC_LABELS,
  GOAL_METRIC_LINKS,
  PERIOD_LABELS,
  formatPeriodRange,
} from "~/components/dashboard/constants";
import { errorMessage, snapshotGoals, type GoalRow } from "~/components/dashboard/api";

type ArchivedGoal = {
  id: string;
  metric: GoalMetric;
  period: GoalPeriod;
  target: number;
};

type HistoryRow = {
  id: string;
  periodStart: string;
  periodEnd: string;
  value: number;
  goal: { metric: GoalMetric; period: GoalPeriod; target: number };
};

const toast = useToast();

const [
  { data: goals, refresh: refreshGoals },
  { data: archived, refresh: refreshArchived },
  { data: history },
] = await Promise.all([
  useFetch("/api/goals", {
    key: "goals-active",
    transform: (res: { data: GoalRow[] }) => res.data,
  }),
  useFetch("/api/goals/archived", {
    key: "goals-archived",
    default: () => [] as ArchivedGoal[],
    transform: (res) => (res as { data: ArchivedGoal[] }).data,
  }),
  useFetch("/api/goals/history", {
    key: "goals-history",
    default: () => [] as HistoryRow[],
    transform: (res) => (res as { data: HistoryRow[] }).data,
  }),
]);

/** Only closed windows belong in history; the live one is shown above. */
const closedHistory = computed(() => {
  const currentStarts = new Set(
    (goals.value ?? []).map((goal) => new Date(goal.progress.periodStart).getTime()),
  );
  return (history.value ?? []).filter(
    (row) => !currentStarts.has(new Date(row.periodStart).getTime()),
  );
});

async function setActive(
  goal: { metric: GoalMetric; period: GoalPeriod; target: number },
  isActive: boolean,
) {
  try {
    await $fetch("/api/goals", {
      method: "POST",
      body: {
        metric: goal.metric,
        period: goal.period,
        target: goal.target,
        isActive,
      },
    });
    await Promise.all([refreshGoals(), refreshArchived()]);
  } catch (e) {
    toast.add({
      severity: "error",
      summary: isActive ? "Could not reactivate the goal" : "Could not archive the goal",
      detail: errorMessage(e),
      life: 6000,
    });
  }
}

async function recalculate() {
  try {
    await snapshotGoals();
    await refreshGoals();
  } catch (e) {
    toast.add({
      severity: "error",
      summary: "Could not recalculate progress",
      detail: errorMessage(e),
      life: 6000,
    });
  }
}
</script>

<template>
  <div>
    <UiPageHeader
      title="Goals"
      description="Targets you set; progress the app measures from real activity."
    >
      <template #action>
        <form @submit.prevent="recalculate">
          <UiButton size="sm" type="submit">Recalculate</UiButton>
        </form>
      </template>
    </UiPageHeader>

    <div class="space-y-4">
      <UiCard>
        <UiCardHeader
          title="Set a goal"
          description="One target per metric and period. Saving an existing pair retunes it."
        />
        <UiCardBody>
          <DashboardGoalForm @saved="refreshGoals()" />
        </UiCardBody>
      </UiCard>

      <UiEmptyState
        v-if="(goals ?? []).length === 0"
        title="No active goals"
        description="Plan §6 suggests starting weekly: 30 companies researched, 30 decision makers identified, 30 personalised outreaches, 3 discovery calls, 1 proposal."
      />
      <div v-else class="grid gap-3 md:grid-cols-2">
        <UiCard v-for="goal in goals" :key="goal.id">
          <UiCardBody class="space-y-2">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <NuxtLink
                  :to="GOAL_METRIC_LINKS[goal.metric]"
                  class="text-sm font-medium hover:text-accent"
                >
                  {{ GOAL_METRIC_LABELS[goal.metric] }}
                </NuxtLink>
                <p class="text-xs text-muted">
                  {{ PERIOD_LABELS[goal.period] }} &middot;
                  {{
                    formatPeriodRange({
                      start: goal.progress.periodStart,
                      end: goal.progress.periodEnd,
                    })
                  }}
                </p>
              </div>
              <UiBadge :tone="goal.progress.onPace ? 'positive' : 'warning'">
                {{
                  goal.progress.onPace
                    ? "On pace"
                    : `${Math.abs(goal.progress.pace)} behind`
                }}
              </UiBadge>
            </div>

            <UiProgressBar
              :value="goal.progress.value"
              :target="goal.target"
              :tone="goal.progress.onPace ? 'positive' : 'warning'"
            />

            <div class="flex items-center justify-between gap-2">
              <p class="text-xs text-muted">
                {{ goal.progress.elapsedPercent }}% of the period elapsed; pace target
                <span class="tabular-nums">{{ goal.progress.expectedByNow }}</span>
              </p>
              <form @submit.prevent="setActive(goal, false)">
                <UiButton size="sm" variant="ghost" type="submit">Archive</UiButton>
              </form>
            </div>
          </UiCardBody>
        </UiCard>
      </div>

      <UiCard v-if="closedHistory.length > 0">
        <UiCardHeader
          title="Previous periods"
          description="Snapshots written when each window closed."
        />
        <UiCardBody class="p-0">
          <UiTable>
            <thead>
              <tr>
                <UiTh>Metric</UiTh>
                <UiTh>Period</UiTh>
                <UiTh>Window</UiTh>
                <UiTh class="text-right">Result</UiTh>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in closedHistory" :key="row.id">
                <UiTd>{{ GOAL_METRIC_LABELS[row.goal.metric] }}</UiTd>
                <UiTd class="text-muted">{{ PERIOD_LABELS[row.goal.period] }}</UiTd>
                <UiTd class="text-muted">
                  {{ formatPeriodRange({ start: row.periodStart, end: row.periodEnd }) }}
                </UiTd>
                <UiTd class="text-right tabular-nums">
                  {{ row.value }} / {{ row.goal.target }}
                </UiTd>
              </tr>
            </tbody>
          </UiTable>
        </UiCardBody>
      </UiCard>

      <UiCard v-if="(archived ?? []).length > 0">
        <UiCardHeader title="Archived goals" />
        <UiCardBody class="space-y-1">
          <div
            v-for="goal in archived"
            :key="goal.id"
            class="flex items-center justify-between gap-3 text-sm"
          >
            <span>
              {{ GOAL_METRIC_LABELS[goal.metric] }}
              <span class="text-xs text-muted">
                {{ PERIOD_LABELS[goal.period] }} &middot; target {{ goal.target }}
              </span>
            </span>
            <form @submit.prevent="setActive(goal, true)">
              <UiButton size="sm" variant="ghost" type="submit">Reactivate</UiButton>
            </form>
          </div>
        </UiCardBody>
      </UiCard>
    </div>
  </div>
</template>
