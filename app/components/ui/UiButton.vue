<script setup lang="ts">
/**
 * Port of `Button` from `src/components/ui/index.tsx`.
 *
 * Backed by PrimeVue `Button` in unstyled mode so the class string is the
 * source's, character for character. React's `onClick` becomes a plain `@click`
 * listener: every unrecognised attribute and listener falls through to the
 * underlying `<button>`, so `type`, `disabled`, `aria-*` and `@click` all work
 * as they did.
 */
import Button from "primevue/button";
import { computed, useAttrs } from "vue";
import { cn } from "~/utils/format";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md";
  }>(),
  { variant: "secondary", size: "md" },
);

const BUTTON_VARIANTS: Record<NonNullable<typeof props.variant>, string> = {
  primary: "bg-accent text-white hover:opacity-90",
  secondary: "border border-border bg-surface hover:bg-surface-muted",
  ghost: "hover:bg-surface-muted",
  danger: "border border-border bg-danger-soft text-danger hover:opacity-90",
};

const attrs = useAttrs();

const rootClass = computed(() =>
  cn(
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
    props.size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
    BUTTON_VARIANTS[props.variant],
    attrs.class as string,
  ),
);

const rest = computed(() => {
  const { class: _class, ...others } = attrs;
  return others;
});
</script>

<template>
  <Button unstyled v-bind="rest" :pt="{ root: rootClass }">
    <slot />
  </Button>
</template>
