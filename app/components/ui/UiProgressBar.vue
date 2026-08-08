<script setup lang="ts">
/**
 * Port of `ProgressBar`. Backed by PrimeVue `ProgressBar` in unstyled mode.
 *
 * The props stay the source's `value` / `target` pair (not PrimeVue's 0-100
 * `value`); the percentage and the `value / target` caption are computed here
 * exactly as they were in React, and the ARIA range is re-declared through PT
 * so screen readers still hear "3 of 10" rather than "30 of 100".
 */
import PrimeProgressBar from "primevue/progressbar";
import { computed } from "vue";
import type { Tone } from "~~/shared/tone";
import { cn } from "~/utils/format";

const props = withDefaults(
  defineProps<{
    value: number;
    target: number;
    tone?: Tone;
  }>(),
  { tone: "accent" },
);

const pct = computed(() =>
  props.target > 0 ? Math.min(100, Math.round((props.value / props.target) * 100)) : 0,
);

const barTone = computed(() =>
  props.tone === "accent"
    ? "bg-accent"
    : props.tone === "positive"
      ? "bg-positive"
      : props.tone === "warning"
        ? "bg-warning"
        : props.tone === "danger"
          ? "bg-danger"
          : "bg-muted",
);
</script>

<template>
  <div class="space-y-1">
    <PrimeProgressBar
      unstyled
      :value="pct"
      :show-value="false"
      :pt="{
        root: {
          class: 'h-2 w-full overflow-hidden rounded-full bg-surface-muted',
          'aria-valuenow': props.value,
          'aria-valuemin': 0,
          'aria-valuemax': props.target,
        },
        value: cn('h-full rounded-full', barTone),
      }"
    />
    <p class="text-xs tabular-nums text-muted">{{ value }} / {{ target }}</p>
  </div>
</template>
