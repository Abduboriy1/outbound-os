<script setup lang="ts">
/**
 * Port of `BoardStageMove` from `src/components/leads/workspace.tsx`.
 * Compact variant for a pipeline card, collapsed until the operator needs it.
 */
defineProps<{
  leadId: string;
  currentStage: string;
}>();

const emit = defineEmits<{ moved: [] }>();
</script>

<template>
  <details class="mt-2">
    <summary class="cursor-pointer list-none text-xs text-muted hover:text-foreground">
      Move stage
    </summary>
    <div class="mt-2">
      <DashboardStageMoveForm
        :lead-id="leadId"
        :current-stage="currentStage"
        layout="stack"
        @moved="emit('moved')"
      />
    </div>
  </details>
</template>
