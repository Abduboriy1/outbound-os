<script setup lang="ts">
/** Port of `PauseEnrollmentButton` from `src/components/outreach/simple-forms.tsx`. */
import ActionForm from "./ActionForm.vue";
import SubmitButton from "./SubmitButton.vue";
import { pauseEnrollmentAction } from "./actions";
import type { ActionState } from "./actions";

const props = defineProps<{ enrollmentId: string }>();

const emit = defineEmits<{ result: [state: ActionState] }>();

function submit() {
  return pauseEnrollmentAction({ enrollmentId: props.enrollmentId });
}
</script>

<template>
  <ActionForm :action="submit" @result="emit('result', $event)">
    <SubmitButton>Pause</SubmitButton>
  </ActionForm>
</template>
