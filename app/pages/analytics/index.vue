<script setup lang="ts">
/**
 * Port of `src/app/(app)/analytics/page.tsx`.
 * Plan §30 — acquisition, outreach, funnel, revenue, and performance by slice.
 *
 * `buildAnalyticsReport` runs server-side behind `/api/analytics`, so every
 * figure is identical to the source's. Two things differ:
 *
 * - `monthlyTrend` was computed from the raw lead rows, which no endpoint
 *   returns. It is computed in the browser from `/api/leads` instead, which
 *   caps at that endpoint's 200 rows.
 * - GAP: `getWeeklyReview` / `generateWeeklyReviewAction` have no endpoint. The
 *   review is read back out of `/api/ai/runs`; regenerating posts to `/api/ai`
 *   with `agent: "weeklyReview"`, which that route does not yet dispatch.
 */
import { formatCurrency } from "~/utils/format";
import {
  errorMessage,
  generateWeeklyReview,
  isWeeklyReview,
  latestCoachRun,
  type AiRunRow,
  type AnalyticsResponse,
  type WeeklyReviewRun,
} from "~/components/dashboard/api";
import { SOURCE_LABELS, periodRange } from "~/components/dashboard/constants";
import { monthlyTrend, type TrendLeadRow } from "~~/shared/analytics/trend";
import type { LeadSourceType } from "~~/server/generated/prisma/client";

const toast = useToast();
const now = new Date();

const [{ data: report }, { data: trendLeads }, { data: coachRuns, refresh: refreshReview }] =
  await Promise.all([
    useFetch("/api/analytics", {
      key: "analytics-report",
      transform: (res: { data: AnalyticsResponse }) => res.data,
    }),
    useFetch("/api/leads", {
      key: "analytics-trend-leads",
      query: { sort: "created", dir: "desc" },
      transform: (res: { data: { leads: TrendLeadRow[] } }) => res.data.leads,
    }),
    useFetch("/api/ai/runs", {
      key: "analytics-weekly-review",
      query: { agent: "salesCoach", status: "SUCCESS", limit: 5 },
      transform: (res: { data: AiRunRow[] }) => res.data,
    }),
  ]);

const review = computed<WeeklyReviewRun | null>(() =>
  latestCoachRun(coachRuns.value, isWeeklyReview, periodRange("WEEKLY", now).start),
);

const trend = computed(() => monthlyTrend(trendLeads.value ?? [], 12, now));

const isEmpty = computed(() => (report.value?.acquisition.discovered ?? 0) === 0);

const acquisition = computed(() => report.value?.acquisition);
const out = computed(() => report.value?.outreach);
const funnel = computed(() => report.value?.funnel ?? []);
const revenue = computed(() => report.value?.revenue);
const weakest = computed(() => report.value?.weakest ?? null);

const funnelChartData = computed(() =>
  funnel.value.map((step) => ({
    label: step.label,
    count: step.count,
    conversionFromPrevious: step.conversionFromPrevious,
  })),
);

function sourceLabel(key: string) {
  return SOURCE_LABELS[key as LeadSourceType] ?? key;
}

/** `generateWeeklyReviewAction`; `revalidatePath` becomes `refreshReview()`. */
async function regenerateReview() {
  try {
    await generateWeeklyReview();
    await refreshReview();
  } catch (e) {
    toast.add({
      severity: "error",
      summary: "Could not generate the weekly review",
      detail: errorMessage(e),
      life: 6000,
    });
  }
}
</script>

<template>
  <div v-if="isEmpty">
    <UiPageHeader title="Analytics" description="Nothing to measure yet." />
    <UiEmptyState
      title="No leads in the pipeline"
      description="Import companies or wait for an inbound submission. Every figure on this page is computed from real activity, so it stays empty until there is some."
    >
      <template #action>
        <NuxtLink to="/import" class="text-sm text-accent hover:underline">
          Import leads
        </NuxtLink>
      </template>
    </UiEmptyState>
  </div>

  <div v-else>
    <UiPageHeader
      title="Analytics"
      description="Every number here is measured from pipeline activity. Nothing is estimated except the weighted pipeline, which is labelled where it appears."
    />

    <div class="space-y-5">
      <DashboardAiWeeklyReview :run="review" :action="regenerateReview" />

      <section class="space-y-2">
        <h2 class="text-sm font-semibold">Revenue</h2>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <UiStatCard
            label="Pipeline value"
            :value="formatCurrency(revenue?.pipelineValue)"
          />
          <UiStatCard
            label="Weighted pipeline"
            :value="formatCurrency(revenue?.weightedPipeline)"
            sub="Discounted by stage probability"
          />
          <UiStatCard
            label="Won revenue"
            :value="formatCurrency(revenue?.wonRevenue)"
            tone="positive"
            :sub="`${revenue?.wonCount ?? 0} deals`"
          />
          <UiStatCard
            label="Lost revenue"
            :value="formatCurrency(revenue?.lostRevenue)"
            :tone="(revenue?.lostRevenue ?? 0) > 0 ? 'danger' : 'neutral'"
            :sub="`${revenue?.lostCount ?? 0} deals`"
          />
          <UiStatCard
            label="Average deal"
            :value="
              revenue?.averageDealSize == null
                ? '—'
                : formatCurrency(revenue.averageDealSize)
            "
          />
          <UiStatCard
            label="Sales cycle"
            :value="
              revenue?.averageSalesCycleDays == null
                ? '—'
                : `${revenue.averageSalesCycleDays}d`
            "
            sub="Created to won"
          />
        </div>
      </section>

      <div class="grid gap-4 lg:grid-cols-2">
        <UiCard>
          <UiCardHeader
            title="Funnel"
            :description="
              weakest
                ? `Weakest step: ${weakest.label} at ${weakest.conversionFromPrevious}% of the previous stage.`
                : 'Lead to won, counting every stage a lead ever reached.'
            "
          />
          <UiCardBody>
            <FunnelChart :data="funnelChartData" />
          </UiCardBody>
        </UiCard>

        <UiCard>
          <UiCardHeader
            title="Trend"
            description="Leads created against deals won, by month."
          />
          <UiCardBody>
            <TrendChart :data="trend" />
          </UiCardBody>
        </UiCard>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <UiCard>
          <UiCardHeader title="Acquisition" />
          <UiCardBody class="space-y-3">
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <UiStatCard label="Discovered" :value="acquisition?.discovered ?? 0" />
              <UiStatCard
                label="Researched"
                :value="acquisition?.researched ?? 0"
                :sub="`${acquisition?.researchedRate ?? 0}%`"
              />
              <UiStatCard label="Qualified" :value="acquisition?.qualified ?? 0" />
              <UiStatCard
                label="Qualified rate"
                :value="`${acquisition?.qualifiedRate ?? 0}%`"
              />
            </div>
            <UiTable>
              <thead>
                <tr>
                  <UiTh>Source</UiTh>
                  <UiTh class="text-right">Leads</UiTh>
                  <UiTh class="text-right">Researched</UiTh>
                  <UiTh class="text-right">Qualified</UiTh>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in acquisition?.bySource ?? []" :key="row.source">
                  <UiTd>{{ SOURCE_LABELS[row.source] }}</UiTd>
                  <UiTd class="text-right tabular-nums">{{ row.leads }}</UiTd>
                  <UiTd class="text-right tabular-nums text-muted">
                    {{ row.researched }}
                  </UiTd>
                  <UiTd class="text-right tabular-nums">
                    {{ row.qualified }}
                    <span class="text-muted">({{ row.qualifiedRate }}%)</span>
                  </UiTd>
                </tr>
              </tbody>
            </UiTable>
          </UiCardBody>
        </UiCard>

        <UiCard>
          <UiCardHeader
            title="Outreach"
            description="Auto-responders are excluded from reply counts."
          />
          <UiCardBody class="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <UiStatCard label="Emails sent" :value="out?.sent ?? 0" />
            <UiStatCard
              label="Replies"
              :value="out?.replies ?? 0"
              :sub="`${out?.replyRate ?? 0}%`"
            />
            <UiStatCard
              label="Positive replies"
              :value="out?.positiveReplies ?? 0"
              :tone="(out?.positiveReplies ?? 0) > 0 ? 'positive' : 'neutral'"
              :sub="`${out?.positiveReplyRate ?? 0}% of sends`"
            />
            <UiStatCard
              label="Bounce rate"
              :value="`${out?.bounceRate ?? 0}%`"
              :tone="(out?.bounceRate ?? 0) > 3 ? 'danger' : 'neutral'"
            />
            <UiStatCard
              label="Opt-out rate"
              :value="`${out?.optOutRate ?? 0}%`"
              :tone="(out?.optOutRate ?? 0) > 1 ? 'warning' : 'neutral'"
            />
            <UiStatCard
              label="Positive of replies"
              :value="`${out?.positiveOfReplies ?? 0}%`"
            />
          </UiCardBody>
        </UiCard>
      </div>

      <UiCard>
        <UiCardHeader
          title="Funnel conversion"
          description="Step-to-step and cumulative, so a strong reply rate cannot hide a weak discovery rate."
        />
        <UiCardBody class="p-0">
          <UiTable>
            <thead>
              <tr>
                <UiTh>Step</UiTh>
                <UiTh class="text-right">Leads</UiTh>
                <UiTh class="text-right">From previous</UiTh>
                <UiTh class="text-right">From top</UiTh>
              </tr>
            </thead>
            <tbody>
              <tr v-for="step in funnel" :key="step.key">
                <UiTd>
                  {{ step.label }}
                  <UiBadge v-if="weakest?.key === step.key" tone="warning" class="ml-2">
                    weakest
                  </UiBadge>
                </UiTd>
                <UiTd class="text-right tabular-nums">{{ step.count }}</UiTd>
                <UiTd class="text-right tabular-nums text-muted">
                  {{
                    step.conversionFromPrevious == null
                      ? "—"
                      : `${step.conversionFromPrevious}%`
                  }}
                </UiTd>
                <UiTd class="text-right tabular-nums text-muted">
                  {{ step.conversionFromLead }}%
                </UiTd>
              </tr>
            </tbody>
          </UiTable>
        </UiCardBody>
      </UiCard>

      <section class="space-y-2">
        <h2 class="text-sm font-semibold">Performance by</h2>
        <div class="grid gap-4 lg:grid-cols-2">
          <DashboardBreakdownTable title="Industry" :rows="report?.byIndustry ?? []" />
          <DashboardBreakdownTable title="ICP" :rows="report?.byIcp ?? []" />
          <DashboardBreakdownTable title="Company size" :rows="report?.bySize ?? []" />
          <DashboardBreakdownTable
            title="Source"
            :rows="report?.bySource ?? []"
            :rename-key="sourceLabel"
          />
          <DashboardBreakdownTable title="Problem type" :rows="report?.byProblem ?? []" />
          <DashboardBreakdownTable title="Loss reason" :rows="report?.lossReasons ?? []" />
        </div>
      </section>
    </div>
  </div>
</template>
