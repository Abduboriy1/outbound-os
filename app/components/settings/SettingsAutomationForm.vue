<script setup lang="ts">
/**
 * Port of `src/app/(app)/settings/automation/automation-form.tsx`.
 *
 * `useActionState(saveAutomationAction)` becomes a `$fetch` to
 * `POST /api/settings/automation`, which re-checks `allowedModes()` server-side
 * exactly as the action did — the dropdown hiding the unsafe option is a
 * courtesy, not the guard. `pending`, `state.error` and `state.saved` are now
 * three refs; the markup and copy are the source's.
 */
import { reactive, ref } from 'vue'
import {
  APPROVAL_MODE_LABELS,
  AUTOMATION_KEYS,
  allowedModes,
} from '~~/shared/settings/automation-keys'
import type { ApprovalMode } from '~~/server/generated/prisma/client'

const props = defineProps<{ current: Record<string, ApprovalMode> }>()
const emit = defineEmits<{ saved: [] }>()

/**
 * React read the initial value straight off `defaultValue` and let the DOM own
 * it thereafter. Vue needs the state, so it is seeded from `current` once.
 */
const values = reactive<Record<string, ApprovalMode>>(
  Object.fromEntries(
    AUTOMATION_KEYS.map(a => [a.key, props.current[a.key] ?? a.default]),
  ),
)

const pending = ref(false)
const error = ref<string | undefined>()
const saved = ref(false)

async function onSubmit() {
  if (pending.value) return
  pending.value = true
  error.value = undefined
  saved.value = false

  try {
    await $fetch('/api/settings/automation', { method: 'POST', body: { ...values } })
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
        title="Approval mode per automation"
        description="Plan §38. Anything that reaches a prospect can never run unattended, so the automatic option is not offered for those."
      >
        <template #action>
          <UiButton type="submit" variant="primary" :disabled="pending">
            {{ pending ? 'Saving' : 'Save' }}
          </UiButton>
        </template>
      </UiCardHeader>
      <UiCardBody class="space-y-3">
        <div
          v-for="automation in AUTOMATION_KEYS"
          :key="automation.key"
          class="grid gap-2 border-b border-border pb-3 last:border-0 sm:grid-cols-[1fr_20rem] sm:items-center"
        >
          <div class="min-w-0">
            <p class="text-sm font-medium">
              {{ automation.label }}
              <UiBadge v-if="automation.reachesProspect" tone="accent" class="ml-2">
                reaches prospects
              </UiBadge>
            </p>
            <p class="text-xs text-muted">{{ automation.description }}</p>
          </div>
          <UiSelect v-model="values[automation.key]" :name="automation.key">
            <option
              v-for="mode in allowedModes(automation.reachesProspect)"
              :key="mode"
              :value="mode"
            >
              {{ APPROVAL_MODE_LABELS[mode] }}
            </option>
          </UiSelect>
        </div>

        <div class="flex items-center gap-3">
          <span v-if="error" class="text-xs text-danger">{{ error }}</span>
          <span v-if="saved" class="text-xs text-positive">Saved.</span>
        </div>
      </UiCardBody>
    </UiCard>
  </form>
</template>
