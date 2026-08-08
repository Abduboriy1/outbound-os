<script setup lang="ts">
/** The private `Section` helper of `src/components/dashboard/weekly-review.tsx`. */
defineProps<{
  title: string;
  items: string[];
  emphasis?: boolean;
}>();
</script>

<template>
  <div
    v-if="items.length > 0"
    :class="emphasis ? 'rounded-md border border-border bg-surface-muted p-3' : ''"
  >
    <p class="text-xs font-medium text-muted">{{ title }}</p>
    <ul class="mt-1 list-inside list-disc space-y-0.5 text-sm">
      <li v-for="item in items" :key="item">{{ item }}</li>
    </ul>
  </div>
</template>
