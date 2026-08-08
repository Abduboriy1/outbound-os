<script setup lang="ts">
/**
 * Port of `SubmitButton` from `src/components/outreach/action-form.tsx`.
 *
 * React's `useFormStatus()` becomes an `inject` of the pending ref that the
 * enclosing `ActionForm` provides; outside one, the button is never pending.
 */
import { inject, ref } from "vue";
import UiButton from "~/components/ui/UiButton.vue";
import { ACTION_FORM_PENDING } from "./form-state";

withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md";
    disabled?: boolean;
    title?: string;
  }>(),
  { variant: "secondary", size: "sm", disabled: false, title: undefined },
);

const pending = inject(ACTION_FORM_PENDING, ref(false));
</script>

<template>
  <UiButton
    type="submit"
    :variant="variant"
    :size="size"
    :disabled="pending || disabled"
    :title="title"
  >
    <template v-if="pending">Working...</template>
    <slot v-else />
  </UiButton>
</template>
