<script setup lang="ts">
/** Port of `PageHeader`. `action` was a ReactNode; it is the `action` slot. */
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <header class="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 class="text-xl font-semibold">{{ title }}</h1>
      <p v-if="description" class="mt-1 text-sm text-muted">{{ description }}</p>
    </div>
    <slot name="action" />
  </header>
</template>
