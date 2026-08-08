<script setup lang="ts">
/**
 * Port of `src/app/(app)/leads/page.tsx`.
 *
 * The server component parsed `searchParams` with `leadFiltersSchema` and
 * queried Prisma. Here the filters stay in the URL exactly as before and
 * `GET /api/leads` parses them with the very same schema, so the filtering,
 * sorting and the `catch()` fallbacks are unchanged. The `<form method="get">`
 * becomes a `@submit.prevent` that pushes the same query string, which keeps
 * the page linkable and the back button meaningful.
 */
import { computed, reactive, watch } from "vue";
import ScoreBadge from "~/components/leads/ScoreBadge.vue";
import StageBadge from "~/components/leads/StageBadge.vue";
import {
  ALL_STAGES,
  LEAD_SOURCE_TYPES,
  LEAD_VIEWS,
  STAGE_LABELS,
  humanise,
} from "~/components/leads/constants";
import { formatDate } from "~/components/leads/display";
import { useIcpOptions } from "~/components/leads/useOptions";
import type { LeadListResponse } from "~/components/leads/api-types";

const route = useRoute();

// Both are started before the first `await`, so neither composable runs outside
// the Nuxt instance context.
const leadsRequest = useFetch("/api/leads", {
  query: computed(() => route.query),
  transform: (res: { data: LeadListResponse }) => res.data,
});

const icpsRequest = useIcpOptions();

const [{ data }, { data: icps }] = await Promise.all([leadsRequest, icpsRequest]);

const leads = computed(() => data.value?.leads ?? []);
const total = computed(() => data.value?.total ?? 0);

/* The filter values the form shows, mirroring `leadFiltersSchema`'s defaults. */
const VIEWS = LEAD_VIEWS.map((v) => v.value) as readonly string[];
const SORTS = ["score", "value", "updated", "created", "due", "company", "stage"];

function one(value: unknown, fallback = ""): string {
  if (Array.isArray(value)) return String(value[0] ?? fallback);
  return value == null ? fallback : String(value);
}

const filters = reactive({
  q: "",
  stage: "",
  view: "all",
  icpId: "",
  source: "",
  minScore: "",
  sort: "score",
  dir: "desc",
});

watch(
  () => route.query,
  (query) => {
    filters.q = one(query.q);
    filters.stage = one(query.stage);
    filters.icpId = one(query.icpId);
    filters.source = one(query.source);
    filters.minScore = one(query.minScore);
    const view = one(query.view, "all");
    filters.view = VIEWS.includes(view) ? view : "all";
    const sort = one(query.sort, "score");
    filters.sort = SORTS.includes(sort) ? sort : "score";
    const dir = one(query.dir, "desc");
    filters.dir = dir === "asc" ? "asc" : "desc";
  },
  { immediate: true },
);

function apply() {
  return navigateTo({ path: "/leads", query: { ...filters } });
}
</script>

<template>
  <div>
    <UiPageHeader
      title="Leads"
      :description="`${total} lead${total === 1 ? '' : 's'} match the current filters.`"
    >
      <template #action>
        <div class="flex gap-2">
          <NuxtLink to="/leads/new">
            <UiButton variant="primary">New lead</UiButton>
          </NuxtLink>
          <NuxtLink to="/pipeline">
            <UiButton>Board view</UiButton>
          </NuxtLink>
        </div>
      </template>
    </UiPageHeader>

    <UiCard class="mb-4 p-3">
      <form class="flex flex-wrap items-end gap-2" @submit.prevent="apply">
        <div class="min-w-48 flex-1">
          <label for="q" class="mb-1 block text-xs font-medium text-muted">Search</label>
          <UiInput
            id="q"
            v-model="filters.q"
            name="q"
            placeholder="Company, domain or contact"
          />
        </div>
        <div class="min-w-40">
          <label for="stage" class="mb-1 block text-xs font-medium text-muted">
            Stage
          </label>
          <UiSelect id="stage" v-model="filters.stage" name="stage">
            <option value="">All stages</option>
            <option v-for="stage in ALL_STAGES" :key="stage" :value="stage">
              {{ STAGE_LABELS[stage] }}
            </option>
          </UiSelect>
        </div>
        <div class="min-w-36">
          <label for="view" class="mb-1 block text-xs font-medium text-muted">View</label>
          <UiSelect id="view" v-model="filters.view" name="view">
            <option v-for="view in LEAD_VIEWS" :key="view.value" :value="view.value">
              {{ view.label }}
            </option>
          </UiSelect>
        </div>
        <div class="min-w-36">
          <label for="icpId" class="mb-1 block text-xs font-medium text-muted">ICP</label>
          <UiSelect id="icpId" v-model="filters.icpId" name="icpId">
            <option value="">Any ICP</option>
            <option v-for="icp in icps" :key="icp.id" :value="icp.id">
              {{ icp.name }}
            </option>
          </UiSelect>
        </div>
        <div class="min-w-36">
          <label for="source" class="mb-1 block text-xs font-medium text-muted">
            Source
          </label>
          <UiSelect id="source" v-model="filters.source" name="source">
            <option value="">Any source</option>
            <option v-for="source in LEAD_SOURCE_TYPES" :key="source" :value="source">
              {{ humanise(source) }}
            </option>
          </UiSelect>
        </div>
        <div class="w-28">
          <label for="minScore" class="mb-1 block text-xs font-medium text-muted">
            Min score
          </label>
          <UiInput
            id="minScore"
            v-model="filters.minScore"
            name="minScore"
            type="number"
            :min="0"
            :max="100"
          />
        </div>
        <div class="min-w-36">
          <label for="sort" class="mb-1 block text-xs font-medium text-muted">Sort</label>
          <UiSelect id="sort" v-model="filters.sort" name="sort">
            <option value="score">Overall score</option>
            <option value="value">Estimated value</option>
            <option value="due">Next action due</option>
            <option value="updated">Recently updated</option>
            <option value="created">Recently added</option>
            <option value="company">Company name</option>
            <option value="stage">Stage</option>
          </UiSelect>
        </div>
        <div class="w-28">
          <label for="dir" class="mb-1 block text-xs font-medium text-muted">Order</label>
          <UiSelect id="dir" v-model="filters.dir" name="dir">
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </UiSelect>
        </div>
        <UiButton type="submit">Apply</UiButton>
        <NuxtLink to="/leads" class="text-xs text-muted hover:text-foreground">
          Reset
        </NuxtLink>
      </form>
    </UiCard>

    <UiEmptyState
      v-if="leads.length === 0"
      title="No leads match"
      description="Loosen the filters, or create a lead from a company you already know."
    >
      <template #action>
        <NuxtLink to="/leads/new">
          <UiButton variant="primary" size="sm">New lead</UiButton>
        </NuxtLink>
      </template>
    </UiEmptyState>

    <UiCard v-else>
      <UiTable>
        <thead>
          <tr>
            <UiTh>Company</UiTh>
            <UiTh>Stage</UiTh>
            <UiTh class="text-right">Fit</UiTh>
            <UiTh class="text-right">Opp</UiTh>
            <UiTh class="text-right">Overall</UiTh>
            <UiTh class="text-right">Value</UiTh>
            <UiTh>Contact</UiTh>
            <UiTh>Next action</UiTh>
            <UiTh>Last contact</UiTh>
          </tr>
        </thead>
        <tbody>
          <tr v-for="lead in leads" :key="lead.id" class="hover:bg-surface-muted">
            <UiTd>
              <NuxtLink :to="`/leads/${lead.id}`" class="font-medium hover:text-accent">
                {{ lead.company.name }}
              </NuxtLink>
              <span class="block text-xs text-muted">
                {{ lead.company.industry ?? lead.company.domain ?? "—" }}
              </span>
            </UiTd>
            <UiTd>
              <StageBadge :stage="lead.stage" />
            </UiTd>
            <UiTd class="text-right tabular-nums text-muted">
              {{ lead.fitScore ?? "—" }}
            </UiTd>
            <UiTd class="text-right tabular-nums text-muted">
              {{ lead.opportunityScore ?? "—" }}
            </UiTd>
            <UiTd class="text-right">
              <ScoreBadge :score="lead.overallScore" />
            </UiTd>
            <UiTd class="text-right tabular-nums">
              {{ formatRange(lead.estimatedValueMin, lead.estimatedValueMax) }}
            </UiTd>
            <UiTd class="text-muted">
              {{
                lead.contact
                  ? `${lead.contact.firstName} ${lead.contact.lastName ?? ""}`
                  : "—"
              }}
            </UiTd>
            <UiTd>
              <template v-if="lead.nextAction">
                <span class="text-sm">{{ lead.nextAction }}</span>
                <span class="block text-xs text-muted">
                  {{ lead.nextActionDueAt ? formatDate(lead.nextActionDueAt) : "no due date" }}
                </span>
              </template>
              <span v-else class="text-xs text-warning">None set</span>
            </UiTd>
            <UiTd class="text-muted">{{ relativeTime(lead.lastContactedAt) }}</UiTd>
          </tr>
        </tbody>
      </UiTable>
    </UiCard>
  </div>
</template>
