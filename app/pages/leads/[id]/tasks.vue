<script setup lang="ts">
/**
 * Port of `src/app/(app)/leads/[id]/tasks/page.tsx`.
 *
 * The source read `prisma.task.findMany({ orderBy: [status, dueAt] })`; the
 * equivalent here is `GET /api/tasks?leadId&status=ALL`, which orders by
 * `dueAt` then `createdAt`. `TaskGroups` re-buckets by due date anyway, so the
 * only visible difference is the order of two tasks inside one bucket.
 */
import { computed } from "vue";
import TaskForm from "~/components/leads/TaskForm.vue";
import TaskGroups from "~/components/leads/TaskGroups.vue";
import {
  addLeadTaskAction,
  setLeadTaskStatusAction,
} from "~/components/leads/actions";
import type { TaskListRow } from "~/components/leads/api-types";

const route = useRoute();
const id = computed(() => String(route.params.id));

const { data: tasks } = await useFetch("/api/tasks", {
  query: computed(() => ({ leadId: id.value, status: "ALL" })),
  transform: (res: { data: TaskListRow[] }) => res.data,
  default: () => [] as TaskListRow[],
});
</script>

<template>
  <div class="space-y-4">
    <UiCard>
      <UiCardHeader title="New task" />
      <UiCardBody>
        <TaskForm :action="addLeadTaskAction" :lead-id="id" />
      </UiCardBody>
    </UiCard>

    <TaskGroups
      :tasks="tasks"
      :action="setLeadTaskStatusAction"
      :lead-id="id"
      :show-lead="false"
      empty-title="No tasks on this lead"
      empty-description="Add the next concrete step so the follow-up engine has something to chase."
    />
  </div>
</template>
