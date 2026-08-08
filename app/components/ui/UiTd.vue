<script setup lang="ts">
/** Port of `Td`. */
import { cn } from "~/utils/format";

defineProps<{ class?: string }>();
</script>

<template>
  <td :class="cn('border-b border-border px-3 py-2 align-middle', $props.class)">
    <slot />
  </td>
</template>
