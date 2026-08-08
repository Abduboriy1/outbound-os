<script setup lang="ts">
/** Port of the private `WeightRow` in `research/icps/icp-editor.tsx`. */
import UiBadge from "~/components/ui/UiBadge.vue";

defineProps<{
  name: string;
  label: string;
  value: number;
}>();

const emit = defineEmits<{ "update:value": [value: number] }>();

function onInput(event: Event) {
  emit("update:value", Number((event.target as HTMLInputElement).value));
}
</script>

<template>
  <label class="flex items-center gap-3">
    <span class="w-40 shrink-0 text-xs text-muted">{{ label }}</span>
    <input
      type="range"
      min="0"
      max="50"
      step="1"
      :value="value"
      class="flex-1"
      @input="onInput"
    >
    <input type="hidden" :name="name" :value="value">
    <UiBadge class="w-9 justify-center tabular-nums">{{ value }}</UiBadge>
  </label>
</template>
