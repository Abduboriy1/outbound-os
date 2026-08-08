<script setup lang="ts">
/**
 * Port of `BoardStageMove` from `src/components/leads/workspace.tsx`.
 * Compact variant for a pipeline card, collapsed until the operator needs it.
 */
import StageMoveForm from "./StageMoveForm.vue";
import type { FormAction } from "./types";

defineProps<{
  action: FormAction;
  leadId: string;
  currentStage: string;
}>();
</script>

<template>
  <details class="mt-2">
    <summary class="cursor-pointer list-none text-xs text-muted hover:text-foreground">
      Move stage
    </summary>
    <div class="mt-2">
      <StageMoveForm
        :action="action"
        :lead-id="leadId"
        :current-stage="currentStage"
        layout="stack"
      />
    </div>
  </details>
</template>
