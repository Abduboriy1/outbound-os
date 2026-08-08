<script setup lang="ts">
/** Port of `Textarea`. Backed by PrimeVue `Textarea`, unstyled. */
import Textarea from "primevue/textarea";
import { computed, useAttrs } from "vue";
import { cn } from "~/utils/format";

defineOptions({ inheritAttrs: false });

const model = defineModel<string | undefined>();

const attrs = useAttrs();

const rootClass = computed(() =>
  cn(
    "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent",
    attrs.class as string,
  ),
);

const rest = computed(() => {
  const { class: _class, ...others } = attrs;
  return others;
});
</script>

<template>
  <Textarea v-model="model" unstyled v-bind="rest" :pt="{ root: rootClass }" />
</template>
