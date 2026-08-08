<script setup lang="ts">
/**
 * Port of `StageMoveForm` from `src/components/leads/workspace.tsx`.
 *
 * Stage changes are a select plus an explicit submit rather than drag and drop,
 * so the board works with a keyboard and a screen reader.
 */
import { computed, ref, watch } from "vue";
import { ALL_STAGES, STAGE_LABELS } from "./constants";
import FormErrors from "./FormErrors.vue";
import type { FormAction, FormState } from "./types";

const props = withDefaults(
  defineProps<{
    action: FormAction;
    leadId: string;
    currentStage: string;
    layout?: "row" | "stack";
  }>(),
  { layout: "row" },
);

const selectId = computed(() => `stage-${props.leadId}`);
const reasonId = computed(() => `stage-reason-${props.leadId}`);

const stage = ref(props.currentStage);
const reason = ref("");

watch(
  () => props.currentStage,
  (value) => {
    stage.value = value;
  },
);

const state = ref<FormState>(undefined);
const pending = ref(false);

async function onSubmit() {
  pending.value = true;
  try {
    state.value = await props.action({
      leadId: props.leadId,
      stage: stage.value,
      reason: reason.value,
    });
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <form
    :class="cn('gap-2', layout === 'row' ? 'flex flex-wrap items-end' : 'grid')"
    @submit.prevent="onSubmit"
  >
    <input type="hidden" name="leadId" :value="leadId">
    <div class="min-w-40 flex-1">
      <label :for="selectId" class="mb-1 block text-xs font-medium text-muted">
        Move to stage
      </label>
      <UiSelect :id="selectId" v-model="stage" name="stage">
        <option v-for="s in ALL_STAGES" :key="s" :value="s">{{ STAGE_LABELS[s] }}</option>
      </UiSelect>
    </div>
    <div class="min-w-40 flex-1">
      <label :for="reasonId" class="mb-1 block text-xs font-medium text-muted">
        Reason
      </label>
      <UiInput :id="reasonId" v-model="reason" name="reason" placeholder="Why now" />
    </div>
    <UiButton type="submit" :disabled="pending">
      {{ pending ? "Moving..." : "Move" }}
    </UiButton>
    <div class="basis-full">
      <FormErrors :state="state" />
    </div>
  </form>
</template>
