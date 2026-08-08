<script setup lang="ts">
/** Port of `NoteForm` from `src/components/leads/workspace.tsx`. */
import { ref } from "vue";
import FormErrors from "./FormErrors.vue";
import type { FormAction, FormState } from "./types";

const props = defineProps<{
  action: FormAction;
  leadId: string;
}>();

const note = ref("");
const state = ref<FormState>(undefined);
const pending = ref(false);

async function onSubmit() {
  pending.value = true;
  try {
    state.value = await props.action({ leadId: props.leadId, note: note.value });
    if (state.value?.ok) note.value = "";
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <form class="space-y-2" @submit.prevent="onSubmit">
    <input type="hidden" name="leadId" :value="leadId">
    <label :for="`note-${leadId}`" class="block text-xs font-medium text-muted">
      Add a note
    </label>
    <UiTextarea
      :id="`note-${leadId}`"
      v-model="note"
      name="note"
      :rows="3"
      required
      placeholder="What happened, and what it means for the deal"
    />
    <FormErrors :state="state" />
    <div class="flex gap-2">
      <UiButton type="submit" variant="primary" size="sm" :disabled="pending">
        {{ pending ? "Saving..." : "Add note" }}
      </UiButton>
    </div>
  </form>
</template>
