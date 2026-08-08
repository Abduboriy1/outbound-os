<script setup lang="ts">
/** Port of the private `ListField` in `research/icps/icp-editor.tsx`. */
import UiField from "~/components/ui/UiField.vue";
import UiTextarea from "~/components/ui/UiTextarea.vue";

defineProps<{
  label: string;
  name: string;
  values: string[];
  placeholder?: string;
}>();

const emit = defineEmits<{ "update:values": [values: string[]] }>();
</script>

<template>
  <UiField :label="label">
    <UiTextarea
      :name="name"
      :rows="4"
      :placeholder="placeholder"
      :model-value="values.join('\n')"
      @update:model-value="emit('update:values', ($event ?? '').split('\n'))"
    />
  </UiField>
</template>
