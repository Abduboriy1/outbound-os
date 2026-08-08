<script setup lang="ts">
/**
 * Port of `SuppressionForm` from
 * `src/app/(app)/settings/compliance/compliance-form.tsx`.
 *
 * `useActionState(addSuppressionAction)` becomes a `$fetch` to
 * `POST /api/settings/suppressions`, which keeps the action's two messages
 * ("Enter a valid email address and reason" / "Enter a valid email address")
 * and its upsert. `/api/email/suppressions` was not reused: it validates
 * differently and would change what the form says when the input is bad.
 *
 * React's uncontrolled inputs are cleared by the form remounting after a server
 * action; here the fields are reset explicitly on success.
 */
import { ref } from 'vue'

const emit = defineEmits<{ added: [] }>()

const REASONS = [
  { value: 'UNSUBSCRIBED', label: 'Unsubscribed' },
  { value: 'BOUNCED', label: 'Bounced' },
  { value: 'COMPLAINT', label: 'Complaint' },
  { value: 'DO_NOT_CONTACT', label: 'Do not contact' },
  { value: 'MANUAL', label: 'Manual' },
]

const email = ref('')
const reason = ref('DO_NOT_CONTACT')
const detail = ref('')

const pending = ref(false)
const error = ref<string | undefined>()

async function onSubmit() {
  if (pending.value) return
  pending.value = true
  error.value = undefined

  try {
    await $fetch('/api/settings/suppressions', {
      method: 'POST',
      body: { email: email.value, reason: reason.value, detail: detail.value },
    })
    email.value = ''
    detail.value = ''
    emit('added')
  }
  catch (e) {
    const err = e as { data?: { error?: string } }
    error.value = err.data?.error ?? 'Something went wrong'
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <form
    class="grid gap-2 sm:grid-cols-[2fr_1fr_2fr_auto] sm:items-end"
    @submit.prevent="onSubmit"
  >
    <UiField label="Email" :error="error">
      <UiInput
        v-model="email"
        name="email"
        type="email"
        required
        placeholder="person@example.com"
      />
    </UiField>
    <UiField label="Reason">
      <UiSelect v-model="reason" name="reason">
        <option v-for="option in REASONS" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </UiSelect>
    </UiField>
    <UiField label="Detail">
      <UiInput
        v-model="detail"
        name="detail"
        placeholder="Asked to be removed on the call"
      />
    </UiField>
    <UiButton type="submit" :disabled="pending">
      {{ pending ? 'Adding' : 'Suppress' }}
    </UiButton>
  </form>
</template>
