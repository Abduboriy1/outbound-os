<script setup lang="ts">
/**
 * Port of `ComplianceForm` from
 * `src/app/(app)/settings/compliance/compliance-form.tsx`.
 *
 * `useActionState(saveComplianceAction)` becomes a `$fetch` to
 * `POST /api/settings/compliance`, which carries the action's zod schema and
 * both of its messages verbatim. As in the source, the error is surfaced on the
 * "Sender email" field — that is where the action's only bespoke message
 * ("Sender email is not a valid address") belongs, and where React put it.
 */
import { reactive, ref } from 'vue'
import type { ComplianceValues } from '~~/shared/settings/compliance'

const props = defineProps<{ initial: ComplianceValues }>()
const emit = defineEmits<{ saved: [] }>()

/**
 * `dailySendLimit` is held as a string because that is what the `<input
 * type="number">` binds and what the source's `FormData` produced — the
 * endpoint's `z.coerce.number()` is unchanged from the action's and does the
 * conversion, so an empty or non-numeric box fails validation the same way.
 */
const values = reactive({
  ...props.initial,
  dailySendLimit: String(props.initial.dailySendLimit),
})

const pending = ref(false)
const error = ref<string | undefined>()
const saved = ref(false)

async function onSubmit() {
  if (pending.value) return
  pending.value = true
  error.value = undefined
  saved.value = false

  try {
    await $fetch('/api/settings/compliance', { method: 'POST', body: { ...values } })
    saved.value = true
    emit('saved')
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
  <form @submit.prevent="onSubmit">
    <UiCard>
      <UiCardHeader
        title="Sender identity"
        description="Plan §37. Commercial email needs a real sender, a real postal address and a working opt-out. Sending is blocked until these are set."
      >
        <template #action>
          <UiButton type="submit" variant="primary" :disabled="pending">
            {{ pending ? 'Saving' : 'Save' }}
          </UiButton>
        </template>
      </UiCardHeader>
      <UiCardBody class="grid gap-3 sm:grid-cols-2">
        <UiField label="Sender name">
          <UiInput v-model="values.senderName" name="senderName" required />
        </UiField>
        <UiField label="Sender email" :error="error">
          <UiInput
            v-model="values.senderEmail"
            name="senderEmail"
            type="email"
            required
          />
        </UiField>
        <div class="sm:col-span-2">
          <UiField
            label="Physical mailing address"
            hint="Appears in the footer of every outbound message."
          >
            <UiTextarea
              v-model="values.physicalAddress"
              name="physicalAddress"
              :rows="2"
              required
            />
          </UiField>
        </div>
        <div class="sm:col-span-2">
          <UiField
            label="Opt-out text"
            hint="Must offer a way out that you actually honour."
          >
            <UiInput
              v-model="values.unsubscribeText"
              name="unsubscribeText"
              required
            />
          </UiField>
        </div>
        <UiField
          label="Daily send limit"
          hint="Sends stop at this number rather than queueing overnight."
        >
          <UiInput
            v-model="values.dailySendLimit"
            name="dailySendLimit"
            type="number"
            :min="0"
            :max="1000"
            required
          />
        </UiField>
        <div class="flex items-end">
          <span v-if="saved" class="text-xs text-positive">Saved.</span>
        </div>
      </UiCardBody>
    </UiCard>
  </form>
</template>
