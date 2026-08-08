<script setup lang="ts">
/**
 * Port of `ReplyComposer` from `src/components/outreach/simple-forms.tsx`.
 *
 * The inbox composer. It drafts with AI and stops — sending happens only from
 * the approval queue (plan §18).
 */
import ActionForm from "./ActionForm.vue";
import SubmitButton from "./SubmitButton.vue";
import { draftReplyAction } from "./actions";
import type { ActionState } from "./actions";

const props = defineProps<{ leadId: string }>();

const emit = defineEmits<{ result: [state: ActionState] }>();

function submit() {
  return draftReplyAction({ leadId: props.leadId });
}
</script>

<template>
  <ActionForm :action="submit" class="space-y-2" @result="emit('result', $event)">
    <p class="text-xs text-muted">
      The reply agent drafts a response from the thread, the research, and the
      objection library. It goes to the approval queue; nothing is sent from
      here.
    </p>
    <SubmitButton variant="primary">Draft a reply with AI</SubmitButton>
  </ActionForm>
</template>
