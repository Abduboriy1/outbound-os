<script setup lang="ts">
/**
 * Port of `TaskGroups` (with its private `TaskItem` / `StatusButtons`) from
 * `src/components/leads/tasks.tsx`.
 *
 * Plan §22 — grouped so overdue work cannot hide behind next month's work.
 *
 * `setTaskStatusAction` becomes `PATCH /api/tasks/:id` (MIGRATION.md §4), which
 * runs the same `setTaskStatus` mutation. The three one-field `<form>`s the
 * React version used to carry `status` through a server action collapse into
 * three buttons calling the same handler.
 */
import type { TaskStatus } from "~~/server/generated/prisma/client";
import { relativeTime } from "~/utils/format";
import { BUCKET_LABELS, BUCKET_ORDER, formatDate, groupByDue } from "./constants";
import { errorMessage } from "./api";

export type TaskRow = {
  id: string;
  title: string;
  detail: string | null;
  dueAt: string | null;
  status: TaskStatus;
  createdByAi: boolean;
  lead?: { id: string; company: { id: string; name: string } } | null;
};

const props = withDefaults(
  defineProps<{
    tasks: TaskRow[];
    showLead?: boolean;
    emptyTitle?: string;
    emptyDescription?: string;
    now?: Date;
  }>(),
  {
    showLead: true,
    emptyTitle: "No tasks",
    emptyDescription: undefined,
    now: () => new Date(),
  },
);

const emit = defineEmits<{ changed: [] }>();

const toast = useToast();
const busy = ref<string | null>(null);

const groups = computed(() => groupByDue(props.tasks, (t) => t.dueAt, props.now));

async function setStatus(id: string, status: TaskStatus) {
  busy.value = id;
  try {
    await $fetch(`/api/tasks/${id}`, { method: "PATCH", body: { status } });
    emit("changed");
  } catch (e) {
    toast.add({
      severity: "error",
      summary: "Could not update the task",
      detail: errorMessage(e),
      life: 6000,
    });
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <UiEmptyState
    v-if="tasks.length === 0"
    :title="emptyTitle"
    :description="emptyDescription"
  />
  <div v-else class="space-y-4">
    <template v-for="bucket in BUCKET_ORDER" :key="bucket">
      <UiCard v-if="groups[bucket].length">
        <UiCardHeader :title="BUCKET_LABELS[bucket]">
          <template #action>
            <UiBadge :tone="bucket === 'overdue' ? 'danger' : 'neutral'">
              {{ groups[bucket].length }}
            </UiBadge>
          </template>
        </UiCardHeader>
        <ul class="divide-y divide-border">
          <li
            v-for="task in groups[bucket]"
            :key="task.id"
            class="flex flex-wrap items-start justify-between gap-3 px-4 py-2.5"
          >
            <div class="min-w-0 flex-1">
              <p class="text-sm">
                {{ task.title }}
                <UiBadge v-if="task.createdByAi" tone="accent" class="ml-2">ai</UiBadge>
              </p>
              <p v-if="task.detail" class="mt-0.5 text-xs whitespace-pre-wrap text-muted">
                {{ task.detail }}
              </p>
              <p class="mt-0.5 text-xs text-muted">
                {{
                  task.dueAt
                    ? `Due ${formatDate(task.dueAt)} · ${relativeTime(task.dueAt)}`
                    : "No due date"
                }}
                <template v-if="showLead && task.lead">
                  ·
                  <NuxtLink :to="`/leads/${task.lead.id}`" class="hover:text-accent">
                    {{ task.lead.company.name }}
                  </NuxtLink>
                </template>
              </p>
            </div>

            <div v-if="task.status !== 'OPEN'" class="flex items-center gap-2">
              <UiBadge :tone="task.status === 'DONE' ? 'positive' : 'neutral'">
                {{ task.status.toLowerCase() }}
              </UiBadge>
              <UiButton
                type="button"
                size="sm"
                :disabled="busy === task.id"
                @click="setStatus(task.id, 'OPEN')"
              >
                Reopen
              </UiButton>
            </div>
            <div v-else class="flex items-center gap-1.5">
              <UiButton
                type="button"
                size="sm"
                variant="primary"
                :disabled="busy === task.id"
                @click="setStatus(task.id, 'DONE')"
              >
                Done
              </UiButton>
              <UiButton
                type="button"
                size="sm"
                :disabled="busy === task.id"
                @click="setStatus(task.id, 'CANCELLED')"
              >
                Cancel
              </UiButton>
            </div>
          </li>
        </ul>
      </UiCard>
    </template>
  </div>
</template>
