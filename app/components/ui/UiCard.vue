<script setup lang="ts">
/**
 * Port of `Card` from `src/components/ui/index.tsx`.
 *
 * Backed by PrimeVue `Card` in unstyled mode: the visual is the source's exact
 * Tailwind string, passed through PT. PrimeVue's Card has no default slot, so
 * children go into its `content` slot; its `body` and `content` wrappers are
 * set to `display: contents` so they add no layout of their own and utilities
 * on the root (`p-3`, `flex`, ...) behave exactly as they did in React.
 */
import Card from "primevue/card";
import { computed, useAttrs } from "vue";
import { cn } from "~/utils/format";

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();

const rootClass = computed(() =>
  cn(
    "rounded-lg border border-border bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
    attrs.class as string,
  ),
);

const rest = computed(() => {
  const { class: _class, ...others } = attrs;
  return others;
});
</script>

<template>
  <Card
    unstyled
    v-bind="rest"
    :pt="{ root: rootClass, body: 'contents', content: 'contents' }"
  >
    <template #content>
      <slot />
    </template>
  </Card>
</template>
