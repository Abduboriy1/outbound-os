<script setup lang="ts">
/**
 * Port of `Badge`. Backed by PrimeVue `Tag` — PrimeVue's own `Badge` is a
 * numeric bubble, whereas this is the label chip the app uses for stage,
 * status and tone. Unstyled, with the source's class string and tone map.
 */
import Tag from "primevue/tag";
import { computed, useAttrs } from "vue";
import type { Tone } from "~~/shared/tone";
import { cn } from "~/utils/format";

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{ tone?: Tone }>(), { tone: "neutral" });

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-surface-muted text-muted",
  accent: "bg-accent-soft text-accent",
  positive: "bg-positive-soft text-positive",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

const attrs = useAttrs();

const rootClass = computed(() =>
  cn(
    "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
    TONE_CLASSES[props.tone],
    attrs.class as string,
  ),
);

const rest = computed(() => {
  const { class: _class, ...others } = attrs;
  return others;
});
</script>

<template>
  <Tag unstyled v-bind="rest" :pt="{ root: rootClass, label: 'contents' }">
    <slot />
  </Tag>
</template>
