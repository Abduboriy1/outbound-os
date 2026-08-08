<script setup lang="ts">
/**
 * Port of `src/app/(app)/page.tsx`.
 *
 * Plan §5 — the homepage answers one question: what should I do today to
 * generate business? The queue comes first because it is the answer; the
 * metrics explain it.
 *
 * The Next version was a server component that called `loadDashboardMetrics`,
 * `loadDailyQueue`, `loadGoalsWithProgress` and `getDailyObservation` against
 * Prisma directly. Server components have no Nuxt equivalent (MIGRATION.md
 * §2.5), and §4 exposes no `/api/dashboard`, so the same figures are assembled
 * from the endpoints that do exist:
 *
 * | source call              | endpoint(s)                                    |
 * | ------------------------ | ---------------------------------------------- |
 * | `loadDashboardMetrics`   | `/api/analytics?period=ALL` + `?period=WEEKLY`  |
 * | `loadDailyQueue`         | `/api/outreach/drafts`, `/api/tasks`,           |
 * |                          | `/api/leads` ×2, `/api/outreach/followups`,     |
 * |                          | `/api/meetings?scope=upcoming`                  |
 * | `loadGoalsWithProgress`  | `/api/goals`                                   |
 * | `getDailyObservation`    | `/api/ai/runs?agent=salesCoach`                |
 *
 * One queue count cannot be reproduced exactly; it is noted at the call site
 * below and in the migration report.
 */
import type { Tone } from "~~/shared/tone";
import type { GoalMetric } from "~~/server/generated/prisma/client";
import {
  errorMessage,
  generateDailyPlan,
  isDailyPlan,
  latestCoachRun,
  type AiRunRow,
  type AnalyticsResponse,
  type DailyPlanRun,
  type GoalRow,
} from "~/components/dashboard/api";
import {
  formatMoney,
  formatPercent,
  type MetricSpec,
} from "~/components/dashboard/metrics";
import type { QueueItem } from "~/components/dashboard/DailyQueue.vue";
import {
  GOAL_METRIC_LABELS,
  GOAL_METRIC_LINKS,
  formatPeriodRange,
} from "~/components/dashboard/constants";

const { user } = useSession();
const toast = useToast();

const now = new Date();
const weekAhead = new Date(now.getTime() + 7 * 24 * 3600_000);

const [
  { data: report },
  { data: weekReport },
  { data: goals },
  { data: coachRuns, refresh: refreshCoach },
  { data: approvals },
  { data: openTasks },
  { data: responded },
  { data: needsResearch },
  { data: followUps },
  { data: discoveryCalls },
] = await Promise.all([
  useFetch("/api/analytics", {
    key: "dashboard-analytics-all",
    query: { period: "ALL" },
    transform: (res: { data: AnalyticsResponse }) => res.data,
  }),
  useFetch("/api/analytics", {
    key: "dashboard-analytics-week",
    query: { period: "WEEKLY" },
    transform: (res: { data: AnalyticsResponse }) => res.data,
  }),
  useFetch("/api/goals", {
    key: "dashboard-goals",
    transform: (res: { data: GoalRow[] }) => res.data,
  }),
  useFetch("/api/ai/runs", {
    key: "dashboard-coach",
    query: { agent: "salesCoach", status: "SUCCESS", limit: 5 },
    transform: (res: { data: AiRunRow[] }) => res.data,
  }),
  useFetch("/api/outreach/drafts", {
    key: "dashboard-approvals",
    transform: (res: { data: unknown[] }) => res.data.length,
  }),
  useFetch("/api/tasks", {
    key: "dashboard-open-tasks",
    query: { status: "OPEN" },
    transform: (res: { data: { dueAt: string | null }[] }) =>
      res.data.filter((t) => t.dueAt != null && new Date(t.dueAt) <= new Date()).length,
  }),
  useFetch("/api/leads", {
    key: "dashboard-responded",
    query: { stage: "RESPONDED" },
    transform: (res: { data: { total: number } }) => res.data.total,
  }),
  // Deviation: `loadDailyQueue` also excludes leads that already have a
  // COMPLETE research report. `/api/leads` cannot express that filter, so this
  // counts every lead still at PROSPECT or RESEARCHING.
  useFetch("/api/leads", {
    key: "dashboard-needs-research",
    query: { stage: "PROSPECT,RESEARCHING" },
    transform: (res: { data: { total: number } }) => res.data.total,
  }),
  useFetch("/api/outreach/followups", {
    key: "dashboard-followups",
    transform: (res: { data: { status: string }[] }) =>
      res.data.filter((f) => f.status === "OVERDUE" || f.status === "DUE_TODAY").length,
  }),
  // `loadDailyQueue`'s `prisma.meeting.count({ scheduledAt: { gte: now, lt:
  // weekAhead } })`. `scope=upcoming` already lower-bounds at `now`, so `to`
  // supplies the `lt` and `take=200` is the endpoint's ceiling — well above the
  // number of calls a week can hold, so `.length` is the count.
  useFetch("/api/meetings", {
    key: "dashboard-discovery-calls",
    query: {
      scope: "upcoming",
      to: weekAhead.toISOString(),
      take: 200,
    },
    transform: (res: { data: unknown[] }) => res.data.length,
  }),
]);

const plan = computed<DailyPlanRun | null>(() =>
  latestCoachRun(coachRuns.value, isDailyPlan, new Date(now.getTime() - 24 * 3600_000)),
);

const firstName = computed(() => (user.value?.name ?? "").split(" ")[0] ?? "");

const funnelStep = (key: string) =>
  report.value?.funnel.find((s) => s.key === key)?.count ?? 0;

const cards = computed<MetricSpec[]>(() => {
  const revenue = report.value?.revenue;
  const out = report.value?.outreach;
  const positiveReplies = out?.positiveReplies ?? 0;
  const dealsWon = revenue?.wonCount ?? 0;

  return [
    {
      label: "New leads this week",
      value: weekReport.value?.acquisition.discovered ?? 0,
      sub: weekReport.value?.window
        ? formatPeriodRange(weekReport.value.window)
        : undefined,
    },
    { label: "Researched", value: report.value?.acquisition.researched ?? 0 },
    { label: "Qualified", value: funnelStep("QUALIFIED") },
    { label: "Outreach sent", value: out?.sent ?? 0 },
    { label: "Replies", value: out?.replies ?? 0 },
    {
      label: "Positive replies",
      value: positiveReplies,
      tone: positiveReplies > 0 ? "positive" : "neutral",
    },
    { label: "Discovery calls", value: funnelStep("DISCOVERY") },
    { label: "Proposals", value: funnelStep("PROPOSAL") },
    {
      label: "Deals won",
      value: dealsWon,
      tone: dealsWon > 0 ? "positive" : "neutral",
    },
    { label: "Pipeline value", value: formatMoney(revenue?.pipelineValue) },
    {
      label: "Weighted pipeline",
      value: formatMoney(revenue?.weightedPipeline),
      sub: "Discounted by stage",
    },
    { label: "Average deal size", value: formatMoney(revenue?.averageDealSize) },
    {
      label: "Response rate",
      value: formatPercent(out?.replyRate),
      sub: "Replies per delivered email",
    },
    {
      label: "Discovery conversion",
      value: formatPercent(
        report.value?.funnel.find((s) => s.key === "DISCOVERY")
          ?.conversionFromPrevious ?? 0,
      ),
      sub: "Replies that became calls",
    },
    {
      label: "Proposal close rate",
      value: formatPercent(
        report.value?.funnel.find((s) => s.key === "WON")?.conversionFromPrevious ?? 0,
      ),
      sub: "Proposals that became wins",
    },
  ];
});

const queue = computed<QueueItem[]>(() => [
  {
    key: "approvals",
    label: "leads waiting for outreach approval",
    count: approvals.value ?? 0,
    href: "/outreach/approvals",
    tone: "accent" as Tone,
    hint: "Nothing is sent without your approval.",
  },
  {
    key: "followups",
    label: "follow-ups due",
    count: Math.max(openTasks.value ?? 0, followUps.value ?? 0),
    href: "/tasks",
    tone: "warning" as Tone,
    hint: "Overdue next actions and open tasks.",
  },
  {
    key: "responded",
    label: "prospects responded",
    count: responded.value ?? 0,
    href: "/outreach/inbox",
    tone: "positive" as Tone,
    hint: "A live conversation is the most valuable thing in the pipeline.",
  },
  {
    key: "discovery",
    label: "discovery calls to prepare",
    count: discoveryCalls.value ?? 0,
    href: "/deals/discovery",
    tone: "positive" as Tone,
    hint: "Scheduled in the next seven days.",
  },
  {
    key: "research",
    label: "leads need research",
    count: needsResearch.value ?? 0,
    href: "/research/queue",
    tone: "neutral" as Tone,
    hint: "No completed research report yet.",
  },
]);

/** `generateDailyPlanAction`; `revalidatePath("/")` becomes `refreshCoach()`. */
async function generatePlan() {
  try {
    await generateDailyPlan();
    await refreshCoach();
  } catch (e) {
    toast.add({
      severity: "error",
      summary: "Could not generate a plan",
      detail: errorMessage(e),
      life: 6000,
    });
  }
}
</script>

<template>
  <div>
    <UiPageHeader
      :title="`Good to see you, ${firstName}`"
      description="What to do today to generate business."
    />

    <div class="space-y-5">
      <DashboardMetricGrid :metrics="cards" />

      <div class="grid gap-4 lg:grid-cols-2">
        <DashboardDailyQueue :items="queue" />
        <DashboardAiDailyPlan :run="plan" :action="generatePlan" />
      </div>

      <UiCard>
        <UiCardHeader
          title="Goal progress"
          description="Computed from real activity, not self-reported."
        >
          <template #action>
            <NuxtLink to="/goals" class="text-xs text-accent hover:underline">
              Manage goals
            </NuxtLink>
          </template>
        </UiCardHeader>
        <UiCardBody>
          <p v-if="!goals || goals.length === 0" class="text-sm text-muted">
            No active goals.
            <NuxtLink to="/goals" class="text-accent hover:underline">
              Set a weekly target
            </NuxtLink>
            to track pace.
          </p>
          <ul v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <li v-for="goal in goals" :key="goal.id">
              <div class="mb-1 flex items-baseline justify-between gap-2">
                <NuxtLink
                  :to="GOAL_METRIC_LINKS[goal.metric as GoalMetric]"
                  class="text-xs font-medium hover:text-accent"
                >
                  {{ GOAL_METRIC_LABELS[goal.metric as GoalMetric] }}
                </NuxtLink>
                <span
                  :class="
                    goal.progress.onPace
                      ? 'text-[11px] text-positive'
                      : 'text-[11px] text-warning'
                  "
                >
                  {{
                    goal.progress.onPace
                      ? "on pace"
                      : `${Math.abs(goal.progress.pace)} behind`
                  }}
                </span>
              </div>
              <UiProgressBar
                :value="goal.progress.value"
                :target="goal.target"
                :tone="goal.progress.onPace ? 'positive' : 'warning'"
              />
            </li>
          </ul>
        </UiCardBody>
      </UiCard>
    </div>
  </div>
</template>
