<script setup lang="ts">
/**
 * Port of `Input`. Backed by PrimeVue `InputText`, unstyled, with the source's
 * class string.
 *
 * React exposed a forwarded ref for uncontrolled use; Vue uses `v-model`
 * instead. Every other attribute (`name`, `type`, `required`, `placeholder`,
 * `autocomplete`, ...) falls through unchanged.
 */
import InputText from "primevue/inputtext";
import { computed, useAttrs } from "vue";
import { cn } from "~/utils/format";

defineOptions({ inheritAttrs: false });

const model = defineModel<string | undefined>();

const attrs = useAttrs();

const rootClass = computed(() =>
  cn(
    "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none placeholder:text-muted focus:border-accent",
    attrs.class as string,
  ),
);

const rest = computed(() => {
  const { class: _class, ...others } = attrs;
  return others;
});
</script>

<template>
  <InputText v-model="model" unstyled v-bind="rest" :pt="{ root: rootClass }" />
</template>
