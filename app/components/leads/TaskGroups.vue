<script setup lang="ts">
/**
 * Port of `TaskGroups` from `src/components/leads/tasks.tsx`.
 * Plan §22 — grouped so overdue work cannot hide behind next month's work.
 */
import { computed } from "vue";
import { toDate } from "./display";
import { groupByDue, type DueBucket } from "~~/shared/leads/due";
import TaskItem from "./TaskItem.vue";
import type { SimpleAction, TaskRow } from "./types";

const props = withDefaults(
  defineProps<{
    tasks: TaskRow[];
    action: SimpleAction;
    leadId?: string;
    showLead?: boolean;
    emptyTitle?: string;
    emptyDescription?: string;
    now?: Date;
  }>(),
  {
    leadId: undefined,
    showLead: true,
    emptyTitle: "No tasks",
    emptyDescription: undefined,
    now: undefined,
  },
);

const BUCKET_LABELS: Record<DueBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
  none: "No due date",
};

const BUCKET_ORDER: DueBucket[] = ["overdue", "today", "upcoming", "none"];

const groups = computed(() =>
  groupByDue(props.tasks, (t) => toDate(t.dueAt), props.now ?? new Date()),
);
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
          <TaskItem
            v-for="task in groups[bucket]"
            :key="task.id"
            :task="task"
            :action="action"
            :lead-id="leadId"
            :show-lead="showLead"
          />
        </ul>
      </UiCard>
    </template>
  </div>
</template>
