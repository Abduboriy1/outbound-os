<script setup lang="ts">
/** The private `Field` helper of `src/components/dashboard/weekly-review.tsx`. */
defineProps<{
  label: string;
  value: string;
}>();
</script>

<template>
  <div v-if="value">
    <p class="text-xs font-medium text-muted">{{ label }}</p>
    <p class="mt-1 text-sm">{{ value }}</p>
  </div>
</template>
