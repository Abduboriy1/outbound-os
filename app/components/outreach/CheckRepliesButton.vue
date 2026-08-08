<script setup lang="ts">
/**
 * Port of `CheckRepliesButton` from `src/components/outreach/simple-forms.tsx`.
 * Polls the email provider for new replies (plan §18).
 */
import ActionForm from "./ActionForm.vue";
import SubmitButton from "./SubmitButton.vue";
import { ingestRepliesAction } from "./actions";
import type { ActionState } from "./actions";

const emit = defineEmits<{ result: [state: ActionState] }>();
</script>

<template>
  <ActionForm :action="ingestRepliesAction" @result="emit('result', $event)">
    <SubmitButton variant="primary">Check for replies</SubmitButton>
  </ActionForm>
</template>
