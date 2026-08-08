<script setup lang="ts">
/**
 * Port of `DeleteForm` from `src/components/leads/forms.tsx`.
 * Still a real `<form>` with a `window.confirm` gate, as in the source.
 */
import type { SimpleAction } from "./types";

const props = withDefaults(
  defineProps<{
    action: SimpleAction;
    id: string;
    label?: string;
    confirmText?: string;
  }>(),
  {
    label: "Delete",
    confirmText: "Delete this record? It can be restored by an administrator.",
  },
);

async function onSubmit() {
  if (!window.confirm(props.confirmText)) return;
  await props.action({ id: props.id });
}
</script>

<template>
  <form @submit.prevent="onSubmit">
    <input type="hidden" name="id" :value="id">
    <UiButton type="submit" variant="danger" size="sm">{{ label }}</UiButton>
  </form>
</template>
