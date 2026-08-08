<script setup lang="ts">
/** Port of the private `TaskItem` component in `src/components/leads/tasks.tsx`. */
import { formatDate } from "./display";
import TaskStatusButtons from "./TaskStatusButtons.vue";
import type { SimpleAction, TaskRow } from "./types";

defineProps<{
  task: TaskRow;
  action: SimpleAction;
  leadId?: string;
  showLead: boolean;
}>();
</script>

<template>
  <li class="flex flex-wrap items-start justify-between gap-3 px-4 py-2.5">
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
          {{ " · " }}
          <NuxtLink :to="`/leads/${task.lead.id}`" class="hover:text-accent">
            {{ task.lead.company.name }}
          </NuxtLink>
        </template>
      </p>
    </div>
    <TaskStatusButtons :action="action" :task="task" :lead-id="leadId" />
  </li>
</template>
