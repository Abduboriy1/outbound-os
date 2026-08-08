<script setup lang="ts">
/** The private `Figure` helper of `src/app/(app)/opportunities/roi-calculator.tsx`. */
defineProps<{
  label: string;
  value: string;
  sub?: string;
}>();
</script>

<template>
  <div class="rounded-md border border-border p-3">
    <p class="text-xs text-muted">{{ label }}</p>
    <p class="mt-1 text-xl font-semibold tabular-nums">{{ value }}</p>
    <p v-if="sub" class="mt-0.5 text-xs text-muted">{{ sub }}</p>
  </div>
</template>
