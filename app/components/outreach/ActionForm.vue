<script setup lang="ts">
/**
 * Port of `ActionForm` from `src/components/outreach/action-form.tsx`.
 *
 * Wraps an action with its result message. Every mutation in the outreach
 * section goes through a real form submit, which is what keeps the "a person
 * clicked this" guarantee honest.
 *
 * React's `useActionState(action, undefined)` becomes a local `state` ref plus
 * a `pending` ref provided to `SubmitButton`. The `action` prop is a
 * zero-argument function rather than `(prev, formData)`, because the fields are
 * `v-model`-bound in the parent and there is no FormData to collect.
 *
 * `onResult` became the `result` event: pages listen to it to refresh their
 * `useFetch`, which is what `revalidatePath` did in the source.
 */
import { provide, ref } from "vue";
import type { ActionState } from "./actions";
import { ACTION_FORM_PENDING } from "./form-state";

const props = defineProps<{ action: () => Promise<ActionState> }>();

const emit = defineEmits<{ result: [state: ActionState] }>();

const state = ref<ActionState>(undefined);
const pending = ref(false);

provide(ACTION_FORM_PENDING, pending);

async function submit() {
  if (pending.value) return;
  pending.value = true;
  state.value = undefined;
  try {
    const result = await props.action();
    state.value = result;
    if (result) emit("result", result);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <form @submit.prevent="submit">
    <slot />
    <p v-if="state?.error" class="mt-2 text-xs text-danger">{{ state.error }}</p>
    <p v-if="state?.message" class="mt-2 text-xs text-positive">
      {{ state.message }}
    </p>
  </form>
</template>
