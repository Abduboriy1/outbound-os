<script setup lang="ts">
/** Port of `TaskForm` from `src/components/leads/workspace.tsx`. */
import { ref } from "vue";
import FormErrors from "./FormErrors.vue";
import type { FormAction, FormState, Option } from "./types";

const props = withDefaults(
  defineProps<{
    action: FormAction;
    leadId?: string;
    leads?: Option[];
  }>(),
  { leadId: undefined, leads: undefined },
);

const title = ref("");
const selectedLeadId = ref("");
const dueAt = ref("");

const state = ref<FormState>(undefined);
const pending = ref(false);

async function onSubmit() {
  pending.value = true;
  try {
    state.value = await props.action({
      // The lead-scoped form posts a hidden leadId; the global one posts the
      // select's value, exactly as the two `<input name="leadId">` shapes did.
      leadId: props.leadId ?? selectedLeadId.value,
      title: title.value,
      dueAt: dueAt.value,
    });
    if (state.value?.ok) {
      title.value = "";
      dueAt.value = "";
      selectedLeadId.value = "";
    }
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <form class="flex flex-wrap items-end gap-2" @submit.prevent="onSubmit">
    <input v-if="leadId" type="hidden" name="leadId" :value="leadId">
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
      <UiSelect id="task-lead" v-model="selectedLeadId" name="leadId">
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
      <FormErrors :state="state" />
    </div>
  </form>
</template>
