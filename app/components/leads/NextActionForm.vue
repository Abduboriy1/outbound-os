<script setup lang="ts">
/** Port of `NextActionForm` from `src/components/leads/workspace.tsx`. */
import { ref, watch } from "vue";
import FormErrors from "./FormErrors.vue";
import type { FormAction, FormState } from "./types";

const props = defineProps<{
  action: FormAction;
  leadId: string;
  nextAction: string | null;
  nextActionDueAt: string | null;
}>();

const nextAction = ref(props.nextAction ?? "");
const nextActionDueAt = ref(props.nextActionDueAt ?? "");

watch(
  () => [props.nextAction, props.nextActionDueAt] as const,
  ([action, dueAt]) => {
    nextAction.value = action ?? "";
    nextActionDueAt.value = dueAt ?? "";
  },
);

const state = ref<FormState>(undefined);
const pending = ref(false);

async function onSubmit() {
  pending.value = true;
  try {
    state.value = await props.action({
      leadId: props.leadId,
      nextAction: nextAction.value,
      nextActionDueAt: nextActionDueAt.value,
    });
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
        :for="`next-action-${leadId}`"
        class="mb-1 block text-xs font-medium text-muted"
      >
        Next action
      </label>
      <UiInput
        :id="`next-action-${leadId}`"
        v-model="nextAction"
        name="nextAction"
        placeholder="Send follow-up"
      />
    </div>
    <div>
      <label :for="`next-due-${leadId}`" class="mb-1 block text-xs font-medium text-muted">
        Due
      </label>
      <UiInput
        :id="`next-due-${leadId}`"
        v-model="nextActionDueAt"
        name="nextActionDueAt"
        type="date"
      />
    </div>
    <UiButton type="submit" :disabled="pending">
      {{ pending ? "Saving..." : "Save" }}
    </UiButton>
    <div class="basis-full">
      <FormErrors :state="state" />
    </div>
  </form>
</template>
