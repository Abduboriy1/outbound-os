<script setup lang="ts">
/**
 * Port of `src/app/(app)/tasks/page.tsx`.
 *
 * `searchParams` becomes `useRoute().query`, and the `<form method="get">` in
 * the header becomes a router navigation carrying `?status=`. `/api/tasks`
 * parses the very same `taskFiltersSchema` the page did, so the filter
 * behaviour (including `catch("OPEN")` on a bad value) is unchanged.
 *
 * GAP: `listNextActions` has no endpoint. The list is derived from
 * `/api/leads`, which returns `nextAction` and `nextActionDueAt` on every row;
 * the filter, sort and grouping are the source's. `/api/leads` caps at 200 rows
 * where the source took 300.
 *
 * `clearNextActionAction` is `POST /api/leads/:id/next-action` with an empty
 * action, which runs the same `setNextAction()` mutation.
 */
import { relativeTime } from "~/utils/format";
import type { LeadStage, TaskStatus } from "~~/server/generated/prisma/client";
import type { TaskRow } from "~/components/dashboard/TaskGroups.vue";
import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  formatDate,
  groupByDue,
} from "~/components/dashboard/constants";
import { errorMessage } from "~/components/dashboard/api";

type NextActionLead = {
  id: string;
  stage: LeadStage;
  nextAction: string | null;
  nextActionDueAt: string | null;
  company: { id: string; name: string };
};

const route = useRoute();
const router = useRouter();
const toast = useToast();
const now = new Date();

/** `taskFiltersSchema` defaults to OPEN and `catch`es anything unrecognised. */
const STATUSES: TaskStatus[] | string[] = ["OPEN", "DONE", "CANCELLED", "ALL"];
const status = computed(() => {
  const raw = Array.isArray(route.query.status) ? route.query.status[0] : route.query.status;
  return typeof raw === "string" && STATUSES.includes(raw) ? raw : "OPEN";
});
const statusInput = ref(status.value);
watch(status, (value) => {
  statusInput.value = value;
});

const { data: tasks, refresh: refreshTasks } = await useFetch("/api/tasks", {
  key: "tasks-list",
  query: { status },
  transform: (res: { data: TaskRow[] }) => res.data,
});

const { data: leads, refresh: refreshLeads } = await useFetch("/api/leads", {
  key: "tasks-next-actions",
  query: { sort: "due", dir: "asc" },
  transform: (res: { data: { leads: NextActionLead[] } }) => res.data.leads,
});

/** `listNextActions`: leads with a next action, due soonest first, nulls last. */
const nextActions = computed(() =>
  (leads.value ?? [])
    .filter((lead) => lead.nextAction != null)
    .sort((a, b) => {
      const aDue = a.nextActionDueAt ? +new Date(a.nextActionDueAt) : Infinity;
      const bDue = b.nextActionDueAt ? +new Date(b.nextActionDueAt) : Infinity;
      return aDue - bDue;
    }),
);

const nextActionGroups = computed(() =>
  groupByDue(nextActions.value, (l) => l.nextActionDueAt, now),
);

const leadChoices = computed(() =>
  nextActions.value.map((l) => ({ value: l.id, label: l.company.name })),
);

function applyFilter() {
  router.push({ query: { ...route.query, status: statusInput.value } });
}

/** `clearNextActionAction` — plan §22, cleared once the operator has done it. */
async function clearNextAction(leadId: string) {
  try {
    await $fetch(`/api/leads/${leadId}/next-action`, {
      method: "POST",
      body: { nextAction: null, nextActionDueAt: null },
    });
    await refreshLeads();
  } catch (e) {
    toast.add({
      severity: "error",
      summary: "Could not clear the next action",
      detail: errorMessage(e),
      life: 6000,
    });
  }
}
</script>

<template>
  <div>
    <UiPageHeader
      title="Tasks"
      description="Everything you owe the pipeline, grouped by when it is due."
    >
      <template #action>
        <form class="flex items-end gap-2" @submit.prevent="applyFilter">
          <div class="min-w-36">
            <label for="status" class="mb-1 block text-xs font-medium text-muted">
              Status
            </label>
            <UiSelect id="status" v-model="statusInput" name="status">
              <option value="OPEN">Open</option>
              <option value="DONE">Done</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="ALL">All</option>
            </UiSelect>
          </div>
          <UiButton type="submit">Apply</UiButton>
        </form>
      </template>
    </UiPageHeader>

    <UiCard class="mb-4">
      <UiCardHeader title="New task" />
      <UiCardBody>
        <DashboardTaskForm :leads="leadChoices" @created="refreshTasks()" />
      </UiCardBody>
    </UiCard>

    <div class="grid gap-4 xl:grid-cols-2">
      <section>
        <h2 class="mb-2 text-sm font-semibold">Tasks</h2>
        <DashboardTaskGroups
          :tasks="tasks ?? []"
          :now="now"
          empty-title="No tasks in this view"
          empty-description="Add a task above, or switch the status filter."
          @changed="refreshTasks()"
        />
      </section>

      <section>
        <h2 class="mb-2 text-sm font-semibold">Lead next actions</h2>
        <UiEmptyState
          v-if="nextActions.length === 0"
          title="No next actions set"
          description="Plan section 22: every active lead should carry a next action."
        >
          <template #action>
            <NuxtLink to="/leads?view=no-next-action">
              <UiButton size="sm">Find leads without one</UiButton>
            </NuxtLink>
          </template>
        </UiEmptyState>
        <div v-else class="space-y-4">
          <template v-for="bucket in BUCKET_ORDER" :key="bucket">
            <UiCard v-if="nextActionGroups[bucket].length">
              <UiCardHeader :title="BUCKET_LABELS[bucket]">
                <template #action>
                  <UiBadge :tone="bucket === 'overdue' ? 'danger' : 'neutral'">
                    {{ nextActionGroups[bucket].length }}
                  </UiBadge>
                </template>
              </UiCardHeader>
              <ul class="divide-y divide-border">
                <li
                  v-for="lead in nextActionGroups[bucket]"
                  :key="lead.id"
                  class="flex flex-wrap items-start justify-between gap-3 px-4 py-2.5"
                >
                  <div class="min-w-0 flex-1">
                    <p class="text-sm">{{ lead.nextAction }}</p>
                    <p class="mt-0.5 text-xs text-muted">
                      <NuxtLink :to="`/leads/${lead.id}`" class="hover:text-accent">
                        {{ lead.company.name }}
                      </NuxtLink>
                      ·
                      {{
                        lead.nextActionDueAt
                          ? `due ${formatDate(lead.nextActionDueAt)} (${relativeTime(lead.nextActionDueAt)})`
                          : "no due date"
                      }}
                    </p>
                  </div>
                  <form @submit.prevent="clearNextAction(lead.id)">
                    <UiButton type="submit" size="sm" variant="primary">Done</UiButton>
                  </form>
                </li>
              </ul>
            </UiCard>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>
