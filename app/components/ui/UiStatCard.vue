<script setup lang="ts">
/**
 * Port of `StatCard`. No PrimeVue counterpart; built on `UiCard`.
 * `value` and `sub` were ReactNodes — pass a string prop or use the slot of the
 * same name for markup.
 */
import type { Tone } from "~~/shared/tone";
import { cn } from "~/utils/format";
import UiCard from "./UiCard.vue";

const props = withDefaults(
  defineProps<{
    label: string;
    value?: string | number;
    sub?: string;
    tone?: Tone;
  }>(),
  { tone: "neutral", value: undefined, sub: undefined },
);
</script>

<template>
  <UiCard class="p-3">
    <p class="text-xs text-muted">{{ label }}</p>
    <p
      :class="
        cn(
          'mt-1 text-2xl font-semibold tabular-nums',
          props.tone === 'positive' && 'text-positive',
          props.tone === 'danger' && 'text-danger',
          props.tone === 'warning' && 'text-warning',
        )
      "
    >
      <slot name="value">{{ value }}</slot>
    </p>
    <p v-if="sub || $slots.sub" class="mt-0.5 text-xs text-muted">
      <slot name="sub">{{ sub }}</slot>
    </p>
  </UiCard>
</template>
