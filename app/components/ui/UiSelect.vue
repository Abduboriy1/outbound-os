<script setup lang="ts">
/**
 * Port of `Select`.
 *
 * The React version rendered a native `<select>` and took `<option>` children,
 * so that contract is the default here: put `<option>`s in the default slot.
 * Pass an `options` array instead and it renders PrimeVue's `Select` (the
 * listbox with filtering, custom item templates and keyboard support), styled
 * to match. Both modes use the same `v-model`.
 */
import Select from "primevue/select";
import { computed, useAttrs } from "vue";
import { cn } from "~/utils/format";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  /** Optional. When present, PrimeVue's rich Select is used instead of a native one. */
  options?: unknown[];
  optionLabel?: string;
  optionValue?: string;
  placeholder?: string;
}>();

const model = defineModel<unknown>();

const attrs = useAttrs();

const rootClass = computed(() =>
  cn(
    "h-9 w-full rounded-md border border-border bg-surface px-2 text-sm outline-none focus:border-accent",
    attrs.class as string,
  ),
);

const rest = computed(() => {
  const { class: _class, ...others } = attrs;
  return others;
});
</script>

<template>
  <Select
    v-if="props.options"
    v-model="model"
    :options="props.options"
    :option-label="props.optionLabel"
    :option-value="props.optionValue"
    :placeholder="props.placeholder"
    v-bind="rest"
    :pt="{ root: cn(rootClass, 'inline-flex items-center') }"
  >
    <template v-for="(_, name) in $slots" #[name]="slotProps" :key="name">
      <slot :name="name" v-bind="slotProps ?? {}" />
    </template>
  </Select>
  <select v-else v-model="model" v-bind="rest" :class="rootClass">
    <slot />
  </select>
</template>
