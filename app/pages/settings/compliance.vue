<script setup lang="ts">
/**
 * Port of `src/app/(app)/settings/compliance/page.tsx` — plan §37: sender
 * identity, opt-out wording, send limits, suppression list.
 *
 * The two Prisma reads and the `initial` fallbacks moved into
 * `GET /api/settings/compliance`. `removeSuppressionAction` — a `<form action>`
 * per row in the source — became `DELETE /api/settings/suppressions/:id`, which
 * keeps the same refusal rule: unsubscribes and complaints are permanent.
 */
import { computed, ref } from 'vue'
import SettingsComplianceForm from '~/components/settings/SettingsComplianceForm.vue'
import SettingsShell from '~/components/settings/SettingsShell.vue'
import SettingsSuppressionForm from '~/components/settings/SettingsSuppressionForm.vue'
import type { ComplianceValues } from '~~/shared/settings/compliance'

const PERMANENT = ['UNSUBSCRIBED', 'COMPLAINT']

type SuppressionEntryRow = {
  id: string
  email: string
  reason: string
  detail: string | null
  createdAt: string
}

const { data, refresh } = await useFetch('/api/settings/compliance', {
  transform: (res: {
    data: { initial: ComplianceValues, suppressions: SuppressionEntryRow[] }
  }) => res.data,
})

const suppressions = computed(() => data.value?.suppressions ?? [])

/** Ids currently being deleted, so a row's button cannot be double-fired. */
const removing = ref<string[]>([])

async function remove(id: string) {
  if (removing.value.includes(id)) return
  removing.value = [...removing.value, id]
  try {
    await $fetch(`/api/settings/suppressions/${id}`, { method: 'DELETE' })
    await refresh()
  }
  finally {
    removing.value = removing.value.filter(other => other !== id)
  }
}

/** `UNSUBSCRIBED` → `unsubscribed`, `DO_NOT_CONTACT` → `do not contact`. */
function reasonLabel(reason: string) {
  return reason.toLowerCase().replace(/_/g, ' ')
}
</script>

<template>
  <SettingsShell>
    <div class="space-y-4">
      <SettingsComplianceForm
        v-if="data"
        :initial="data.initial"
        @saved="refresh()"
      />

      <UiCard>
        <UiCardHeader
          title="Suppression list"
          description="Nobody on this list is contacted again. Unsubscribes and complaints are permanent and cannot be removed here."
        />
        <UiCardBody class="space-y-3">
          <SettingsSuppressionForm @added="refresh()" />

          <p v-if="suppressions.length === 0" class="text-sm text-muted">
            The list is empty.
          </p>
          <UiTable v-else>
            <thead>
              <tr>
                <UiTh>Email</UiTh>
                <UiTh>Reason</UiTh>
                <UiTh>Detail</UiTh>
                <UiTh class="text-right">Added</UiTh>
                <UiTh />
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in suppressions" :key="entry.id">
                <UiTd>{{ entry.email }}</UiTd>
                <UiTd>
                  <UiBadge :tone="PERMANENT.includes(entry.reason) ? 'danger' : 'warning'">
                    {{ reasonLabel(entry.reason) }}
                  </UiBadge>
                </UiTd>
                <UiTd class="max-w-[16rem] truncate text-muted">
                  {{ entry.detail ?? '—' }}
                </UiTd>
                <UiTd class="text-right text-muted">
                  {{ relativeTime(entry.createdAt) }}
                </UiTd>
                <UiTd class="text-right">
                  <span
                    v-if="PERMANENT.includes(entry.reason)"
                    class="text-xs text-muted"
                  >permanent</span>
                  <UiButton
                    v-else
                    size="sm"
                    variant="ghost"
                    :disabled="removing.includes(entry.id)"
                    @click="remove(entry.id)"
                  >
                    Remove
                  </UiButton>
                </UiTd>
              </tr>
            </tbody>
          </UiTable>
        </UiCardBody>
      </UiCard>
    </div>
  </SettingsShell>
</template>
