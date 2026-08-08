<script setup lang="ts">
/** Port of `Th`. */
import { cn } from "~/utils/format";

defineProps<{ class?: string }>();
</script>

<template>
  <th
    :class="
      cn(
        'border-b border-border px-3 py-2 text-left text-xs font-medium text-muted',
        $props.class,
      )
    "
  >
    <slot />
  </th>
</template>
