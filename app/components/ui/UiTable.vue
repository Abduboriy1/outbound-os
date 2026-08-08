<script setup lang="ts">
/**
 * Port of `Table`. Deliberately still a real `<table>`: the source composes
 * rows by hand everywhere, and PrimeVue's `DataTable` is data-driven with an
 * incompatible API. Reach for `DataTable` + `Column` (both auto-imported) when
 * you want sorting, paging or virtual scroll; use this for hand-built tables.
 */
import { cn } from "~/utils/format";

defineProps<{ class?: string }>();
</script>

<template>
  <div class="w-full overflow-x-auto">
    <table :class="cn('w-full text-sm', $props.class)">
      <slot />
    </table>
  </div>
</template>
