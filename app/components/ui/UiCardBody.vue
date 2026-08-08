<script setup lang="ts">
/** Port of `CardBody`. A padded container; no PrimeVue counterpart. */
import { cn } from "~/utils/format";

defineProps<{ class?: string }>();
</script>

<template>
  <div :class="cn('p-4', $props.class)">
    <slot />
  </div>
</template>
