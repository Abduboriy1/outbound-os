<script setup lang="ts">
/**
 * Not in the React source — added because the pages agents inherit the app's
 * zod schemas and `@primevue/forms` can validate against them directly.
 *
 * Pass a zod schema and it is wrapped in the PrimeVue zod resolver; the default
 * slot receives PrimeVue's `$form` state, and `@submit` fires with
 * `{ valid, values, states, errors }`.
 *
 * ── Field registration (read this before using it) ──────────────────────────
 * Fields register themselves with the form by their `name`, and only a
 * PrimeVue-backed input can do that — it injects `$pcForm` and calls
 * `register()` on mount. So the controls inside must be `UiInput`,
 * `UiTextarea`, `UiSelect`, or a raw PrimeVue input:
 *
 *   <UiForm :schema="schema" @submit="onSubmit">
 *     <template #default="{ $form }">
 *       <UiField label="Email" :error="$form.email?.error?.message">
 *         <UiInput name="email" />
 *       </UiField>
 *       <UiButton type="submit" variant="primary">Save</UiButton>
 *     </template>
 *   </UiForm>
 *
 * A bare `<input name="…">` will never appear on `$form` — PrimeVue 4 does not
 * scan the DOM for fields. Do **not** try to fix that with
 * `v-bind="$form.register('email')"` in the template either: `register()`
 * mutates form state, so calling it during render loops until Vue throws
 * "Maximum recursive updates exceeded".
 *
 * For a plain form with hand-rolled validation, skip `UiForm` entirely and use
 * a plain `<form>` with `UiField`'s `error` prop — that is what the ported
 * login and register pages do.
 */
import { Form } from "@primevue/forms";
import { zodResolver } from "@primevue/forms/resolvers/zod";
import { computed } from "vue";
import type { ZodType } from "zod";

const props = defineProps<{
  schema?: ZodType;
  initialValues?: Record<string, unknown>;
}>();

const emit = defineEmits<{ submit: [event: Record<string, unknown>] }>();

const resolver = computed(() =>
  props.schema ? zodResolver(props.schema) : undefined,
);
</script>

<template>
  <Form
    v-slot="$form"
    :resolver="resolver"
    :initial-values="props.initialValues"
    @submit="emit('submit', $event as unknown as Record<string, unknown>)"
  >
    <slot v-bind="{ $form }" />
  </Form>
</template>
