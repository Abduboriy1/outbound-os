<script setup lang="ts">
/** Port of `SweepFollowUpsButton` from `src/components/outreach/simple-forms.tsx`. */
import ActionForm from "./ActionForm.vue";
import SubmitButton from "./SubmitButton.vue";
import { sweepFollowUpsAction } from "./actions";
import type { ActionState } from "./actions";

const emit = defineEmits<{ result: [state: ActionState] }>();
</script>

<template>
  <ActionForm :action="sweepFollowUpsAction" @result="emit('result', $event)">
    <SubmitButton>Refresh next actions</SubmitButton>
  </ActionForm>
</template>
