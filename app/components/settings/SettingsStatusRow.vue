<script setup lang="ts">
/**
 * The `Row` helper defined at the bottom of `src/app/(app)/settings/page.tsx`:
 * a label, a toned badge with the current value, and a link to the tab that
 * changes it.
 */
import type { Tone } from '~~/shared/tone'

defineProps<{
  label: string
  value: string
  tone: Tone
  href: string
}>()
</script>

<template>
  <div
    class="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0"
  >
    <span class="text-muted">{{ label }}</span>
    <span class="flex items-center gap-2">
      <UiBadge :tone="tone">{{ value }}</UiBadge>
      <NuxtLink :to="href" class="text-xs text-accent hover:underline">edit</NuxtLink>
    </span>
  </div>
</template>
