<script setup lang="ts">
/** Port of `EnrolForm` from `src/components/outreach/simple-forms.tsx`. */
import { ref, watch } from "vue";
import UiSelect from "~/components/ui/UiSelect.vue";
import ActionForm from "./ActionForm.vue";
import SubmitButton from "./SubmitButton.vue";
import { enrolLeadAction } from "./actions";
import type { ActionState } from "./actions";

const props = defineProps<{
  sequences: { id: string; name: string }[];
  leads: { id: string; label: string }[];
}>();

const emit = defineEmits<{ result: [state: ActionState] }>();

// A native <select> with no explicit value picks its first option; React did
// the same, so the refs are seeded from the lists and follow them.
const sequenceId = ref(props.sequences[0]?.id ?? "");
const leadId = ref(props.leads[0]?.id ?? "");

watch(
  () => props.sequences,
  (next) => {
    if (!next.some((sequence) => sequence.id === sequenceId.value)) {
      sequenceId.value = next[0]?.id ?? "";
    }
  },
);
watch(
  () => props.leads,
  (next) => {
    if (!next.some((lead) => lead.id === leadId.value)) {
      leadId.value = next[0]?.id ?? "";
    }
  },
);

function submit() {
  return enrolLeadAction({ sequenceId: sequenceId.value, leadId: leadId.value });
}
</script>

<template>
  <ActionForm
    :action="submit"
    class="flex flex-wrap items-end gap-2"
    @result="emit('result', $event)"
  >
    <label class="text-xs text-muted">
      Sequence
      <UiSelect v-model="sequenceId" name="sequenceId" class="mt-1 w-56">
        <option v-for="sequence in sequences" :key="sequence.id" :value="sequence.id">
          {{ sequence.name }}
        </option>
      </UiSelect>
    </label>
    <label class="text-xs text-muted">
      Lead
      <UiSelect v-model="leadId" name="leadId" class="mt-1 w-64">
        <option v-for="lead in leads" :key="lead.id" :value="lead.id">
          {{ lead.label }}
        </option>
      </UiSelect>
    </label>
    <SubmitButton>Enrol</SubmitButton>
  </ActionForm>
</template>
