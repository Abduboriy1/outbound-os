<script setup lang="ts">
/**
 * Port of `TaskForm` from `src/components/leads/workspace.tsx`.
 *
 * `createTaskAction` becomes `POST /api/tasks` (MIGRATION.md §4), which parses
 * the same `taskInputSchema` and calls the same `createTask` mutation.
 */
import { errorMessage } from "./api";

const props = defineProps<{
  leadId?: string;
  leads?: { value: string; label: string }[];
}>();

const emit = defineEmits<{ created: [] }>();

const title = ref("");
const selectedLead = ref("");
const dueAt = ref("");
const pending = ref(false);
const error = ref<string | null>(null);

async function submit() {
  pending.value = true;
  error.value = null;
  try {
    await $fetch("/api/tasks", {
      method: "POST",
      body: {
        title: title.value,
        leadId: props.leadId ?? selectedLead.value,
        dueAt: dueAt.value,
      },
    });
    title.value = "";
    selectedLead.value = "";
    dueAt.value = "";
    emit("created");
  } catch (e) {
    error.value = errorMessage(e, "Could not create the task");
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <form class="flex flex-wrap items-end gap-2" @submit.prevent="submit">
    <div class="min-w-48 flex-1">
      <label for="task-title" class="mb-1 block text-xs font-medium text-muted">
        Task
      </label>
      <UiInput
        id="task-title"
        v-model="title"
        name="title"
        required
        placeholder="Prepare proposal"
      />
    </div>
    <div v-if="leads" class="min-w-40">
      <label for="task-lead" class="mb-1 block text-xs font-medium text-muted">
        Lead
      </label>
      <UiSelect id="task-lead" v-model="selectedLead" name="leadId">
        <option value="">No lead</option>
        <option v-for="l in leads" :key="l.value" :value="l.value">{{ l.label }}</option>
      </UiSelect>
    </div>
    <div>
      <label for="task-due" class="mb-1 block text-xs font-medium text-muted">Due</label>
      <UiInput id="task-due" v-model="dueAt" name="dueAt" type="date" />
    </div>
    <UiButton type="submit" variant="primary" :disabled="pending">
      {{ pending ? "Adding..." : "Add task" }}
    </UiButton>
    <div class="basis-full">
      <p v-if="error" role="alert" class="text-xs text-danger">{{ error }}</p>
    </div>
  </form>
</template>
