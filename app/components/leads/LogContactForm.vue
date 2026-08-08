<script setup lang="ts">
/** Port of `LogContactForm` from `src/components/leads/workspace.tsx`. */
import { ref } from "vue";
import FormErrors from "./FormErrors.vue";
import type { FormAction, FormState } from "./types";

const props = defineProps<{
  action: FormAction;
  leadId: string;
}>();

const summary = ref("");
const state = ref<FormState>(undefined);
const pending = ref(false);

async function onSubmit() {
  pending.value = true;
  try {
    state.value = await props.action({ leadId: props.leadId, summary: summary.value });
    if (state.value?.ok) summary.value = "";
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <form class="flex flex-wrap items-end gap-2" @submit.prevent="onSubmit">
    <input type="hidden" name="leadId" :value="leadId">
    <div class="min-w-48 flex-1">
      <label
        :for="`contact-log-${leadId}`"
        class="mb-1 block text-xs font-medium text-muted"
      >
        Log a conversation
      </label>
      <UiInput
        :id="`contact-log-${leadId}`"
        v-model="summary"
        name="summary"
        required
        placeholder="Called the ops lead"
      />
    </div>
    <UiButton type="submit" :disabled="pending">
      {{ pending ? "Saving..." : "Log" }}
    </UiButton>
    <div class="basis-full">
      <FormErrors :state="state" />
    </div>
  </form>
</template>
