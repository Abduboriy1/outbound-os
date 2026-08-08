<script setup lang="ts">
/**
 * Port of `MetricGrid` from `src/components/dashboard/metrics.tsx`.
 * The §5 metrics row. Every figure is measured; none is a placeholder.
 */
import type { MetricSpec } from "./metrics";

defineProps<{ metrics: MetricSpec[] }>();
</script>

<template>
  <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
    <UiStatCard
      v-for="metric in metrics"
      :key="metric.label"
      :label="metric.label"
      :value="metric.value"
      :sub="metric.sub"
      :tone="metric.tone"
    />
  </div>
</template>
