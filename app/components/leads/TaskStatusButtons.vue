<script setup lang="ts">
/** Port of the private `StatusButtons` component in `src/components/leads/tasks.tsx`. */
import type { SimpleAction, TaskRow } from "./types";

const props = defineProps<{
  action: SimpleAction;
  task: TaskRow;
  leadId?: string;
}>();

function submit(status: "OPEN" | "DONE" | "CANCELLED") {
  return props.action({
    id: props.task.id,
    ...(props.leadId ? { leadId: props.leadId } : {}),
    status,
  });
}
</script>

<template>
  <form
    v-if="task.status !== 'OPEN'"
    class="flex items-center gap-2"
    @submit.prevent="submit('OPEN')"
  >
    <input type="hidden" name="id" :value="task.id">
    <input v-if="leadId" type="hidden" name="leadId" :value="leadId">
    <input type="hidden" name="status" value="OPEN">
    <UiBadge :tone="task.status === 'DONE' ? 'positive' : 'neutral'">
      {{ task.status.toLowerCase() }}
    </UiBadge>
    <UiButton type="submit" size="sm">Reopen</UiButton>
  </form>

  <div v-else class="flex items-center gap-1.5">
    <form @submit.prevent="submit('DONE')">
      <input type="hidden" name="id" :value="task.id">
      <input v-if="leadId" type="hidden" name="leadId" :value="leadId">
      <input type="hidden" name="status" value="DONE">
      <UiButton type="submit" size="sm" variant="primary">Done</UiButton>
    </form>
    <form @submit.prevent="submit('CANCELLED')">
      <input type="hidden" name="id" :value="task.id">
      <input v-if="leadId" type="hidden" name="leadId" :value="leadId">
      <input type="hidden" name="status" value="CANCELLED">
      <UiButton type="submit" size="sm">Cancel</UiButton>
    </form>
  </div>
</template>
