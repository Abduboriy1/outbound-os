<script setup lang="ts">
/**
 * The `Rule` helper that `settings/ai/page.tsx` and `settings/email/page.tsx`
 * each defined at the bottom of the file. One bullet, one line of prose.
 */
defineProps<{ text: string }>()
</script>

<template>
  <p class="flex gap-2">
    <span aria-hidden="true" class="text-positive">&bull;</span>
    {{ text }}
  </p>
</template>
