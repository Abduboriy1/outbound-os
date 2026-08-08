<script setup lang="ts">
/**
 * Port of `CardHeader`. No PrimeVue counterpart — PrimeVue's Card header slot
 * carries no structure — so this stays a thin SFC.
 *
 * React `title` / `description` / `action` were ReactNodes; here each is either
 * a string prop or a slot of the same name, so markup can still be passed in.
 */
import { cn } from "~/utils/format";

defineProps<{
  title?: string;
  description?: string;
  class?: string;
}>();
</script>

<template>
  <div
    :class="
      cn(
        'flex items-start justify-between gap-4 border-b border-border px-4 py-3',
        $props.class,
      )
    "
  >
    <div class="min-w-0">
      <h2 class="text-sm font-semibold">
        <slot name="title">{{ title }}</slot>
      </h2>
      <p v-if="description || $slots.description" class="mt-0.5 text-xs text-muted">
        <slot name="description">{{ description }}</slot>
      </p>
    </div>
    <slot name="action" />
  </div>
</template>
