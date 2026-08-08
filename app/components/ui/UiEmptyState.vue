<script setup lang="ts">
/** Port of `EmptyState`. No PrimeVue counterpart. `action` is a slot. */
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <div
    class="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center"
  >
    <p class="text-sm font-medium">{{ title }}</p>
    <p v-if="description" class="max-w-sm text-xs text-muted">{{ description }}</p>
    <slot name="action" />
  </div>
</template>
