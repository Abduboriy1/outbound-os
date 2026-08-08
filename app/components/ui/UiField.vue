<script setup lang="ts">
/**
 * Port of `Field`: a label, the control, and one line of hint-or-error beneath.
 *
 * Kept as a thin SFC rather than `@primevue/forms`' `FormField`, because
 * `FormField` only works inside a `<Form>` with a resolver while this wrapper
 * is used standalone all over the app. Inside a PrimeVue `<Form>`, pass the
 * resolver's message straight in: `:error="$form.email?.error?.message"`.
 * See `UiForm.vue` for the zod-backed form wrapper.
 */
defineProps<{
  label: string;
  hint?: string;
  error?: string;
}>();
</script>

<template>
  <label class="block space-y-1">
    <span class="text-xs font-medium text-muted">{{ label }}</span>
    <slot />
    <span v-if="hint && !error" class="block text-xs text-muted">{{ hint }}</span>
    <span v-if="error" class="block text-xs text-danger">{{ error }}</span>
  </label>
</template>
