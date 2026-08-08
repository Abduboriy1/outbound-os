<script setup lang="ts">
/** Port of `SequenceBuilder` from `src/components/outreach/simple-forms.tsx`. */
import { ref } from "vue";
import UiInput from "~/components/ui/UiInput.vue";
import UiSelect from "~/components/ui/UiSelect.vue";
import UiTextarea from "~/components/ui/UiTextarea.vue";
import ActionForm from "./ActionForm.vue";
import SubmitButton from "./SubmitButton.vue";
import type { ActionState } from "./actions";
import type { SequenceDraftStep as Step } from "./types";

const props = defineProps<{
  action: (input: {
    name: string;
    description?: string;
    steps: Step[];
  }) => Promise<ActionState>;
}>();

const emit = defineEmits<{ result: [state: ActionState] }>();

const STARTER_STEPS: Step[] = [
  { dayOffset: 0, purpose: "Initial personalised message", channel: "EMAIL" },
  { dayOffset: 4, purpose: "Short follow-up", channel: "EMAIL" },
  { dayOffset: 10, purpose: "Useful observation or resource", channel: "EMAIL" },
  { dayOffset: 20, purpose: "Final follow-up", channel: "EMAIL" },
];

const name = ref("");
const description = ref("");
const steps = ref<Step[]>(STARTER_STEPS.map((step) => ({ ...step })));

function update(index: number, patch: Partial<Step>) {
  steps.value = steps.value.map((step, i) =>
    i === index ? { ...step, ...patch } : step,
  );
}

function remove(index: number) {
  steps.value = steps.value.filter((_, i) => i !== index);
}

function addStep() {
  steps.value = [
    ...steps.value,
    {
      dayOffset: (steps.value.at(-1)?.dayOffset ?? 0) + 5,
      purpose: "Follow-up",
      channel: "EMAIL",
    },
  ];
}

function submit() {
  return props.action({
    name: name.value,
    description: description.value,
    steps: steps.value,
  });
}
</script>

<template>
  <ActionForm :action="submit" class="space-y-3" @result="emit('result', $event)">
    <UiInput v-model="name" name="name" placeholder="Sequence name" required />
    <UiTextarea
      v-model="description"
      name="description"
      :rows="2"
      placeholder="When should this sequence be used?"
    />

    <div class="space-y-2">
      <div
        v-for="(step, index) in steps"
        :key="index"
        class="flex flex-wrap items-center gap-2"
      >
        <label class="text-xs text-muted">
          Day
          <UiInput
            type="number"
            min="0"
            :model-value="String(step.dayOffset)"
            class="mt-1 w-20"
            @update:model-value="update(index, { dayOffset: Number($event ?? 0) })"
          />
        </label>
        <label class="min-w-48 flex-1 text-xs text-muted">
          Purpose
          <UiInput
            :model-value="step.purpose"
            class="mt-1"
            @update:model-value="update(index, { purpose: $event ?? '' })"
          />
        </label>
        <label class="text-xs text-muted">
          Channel
          <UiSelect
            :model-value="step.channel"
            class="mt-1 w-32"
            @update:model-value="
              update(index, { channel: $event as Step['channel'] })
            "
          >
            <option value="EMAIL">Email</option>
            <option value="LINKEDIN">LinkedIn</option>
          </UiSelect>
        </label>
        <button
          type="button"
          class="text-xs text-muted hover:text-danger"
          @click="remove(index)"
        >
          Remove
        </button>
      </div>
    </div>

    <div class="flex gap-2">
      <button type="button" class="text-xs text-accent" @click="addStep">
        Add step
      </button>
      <SubmitButton variant="primary">Create sequence</SubmitButton>
    </div>
  </ActionForm>
</template>
