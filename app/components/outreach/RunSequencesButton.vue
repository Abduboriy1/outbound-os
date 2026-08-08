<script setup lang="ts">
/** Port of `RunSequencesButton` from `src/components/outreach/simple-forms.tsx`. */
import ActionForm from "./ActionForm.vue";
import SubmitButton from "./SubmitButton.vue";
import { runSequencesAction } from "./actions";
import type { ActionState } from "./actions";

const emit = defineEmits<{ result: [state: ActionState] }>();
</script>

<template>
  <ActionForm :action="runSequencesAction" @result="emit('result', $event)">
    <SubmitButton>Advance due steps</SubmitButton>
  </ActionForm>
</template>
