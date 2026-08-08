<script setup lang="ts">
/**
 * Port of `src/app/(app)/settings/integrations/page.tsx` — plan §35: every
 * third-party sits behind an interface with a mock default.
 *
 * `prisma.integration.findMany({ include: { _count: { credentials } } })` became
 * `GET /api/settings/integrations`, which flattens `_count.credentials` to
 * `credentialCount`. `/api/integrations/gmail/status` was not reusable here — it
 * describes one connection, not the list.
 */
import { computed } from 'vue'
import SettingsProviderCard from '~/components/settings/SettingsProviderCard.vue'
import SettingsShell from '~/components/settings/SettingsShell.vue'
import type { ProviderStatuses } from '~~/shared/settings/providers'

type IntegrationRow = {
  id: string
  kind: string
  provider: string
  isEnabled: boolean
  credentialCount: number
  updatedAt: string
}

const { data: providers } = await useFetch('/api/settings/providers', {
  transform: (res: { data: ProviderStatuses }) => res.data,
})
const { data } = await useFetch('/api/settings/integrations', {
  transform: (res: { data: IntegrationRow[] }) => res.data,
})

const integrations = computed(() => data.value ?? [])
</script>

<template>
  <SettingsShell>
    <div class="space-y-4">
      <div class="grid gap-3 lg:grid-cols-3">
        <template v-if="providers">
          <SettingsProviderCard :status="providers.ai" />
          <SettingsProviderCard :status="providers.email" />
          <SettingsProviderCard :status="providers.search" />
        </template>
      </div>

      <UiCard>
        <UiCardHeader
          title="Connected accounts"
          description="Credentials are encrypted at rest; the plaintext never touches the database."
        />
        <UiCardBody class="p-0">
          <p v-if="integrations.length === 0" class="p-4 text-sm text-muted">
            Nothing connected. The app runs fully on mock providers until you connect
            one.
          </p>
          <UiTable v-else>
            <thead>
              <tr>
                <UiTh>Kind</UiTh>
                <UiTh>Provider</UiTh>
                <UiTh>Status</UiTh>
                <UiTh class="text-right">Credentials</UiTh>
                <UiTh class="text-right">Updated</UiTh>
              </tr>
            </thead>
            <tbody>
              <tr v-for="integration in integrations" :key="integration.id">
                <UiTd>{{ integration.kind }}</UiTd>
                <UiTd class="text-muted">{{ integration.provider }}</UiTd>
                <UiTd>
                  <UiBadge :tone="integration.isEnabled ? 'positive' : 'neutral'">
                    {{ integration.isEnabled ? 'Enabled' : 'Disabled' }}
                  </UiBadge>
                </UiTd>
                <UiTd class="text-right tabular-nums text-muted">
                  {{ integration.credentialCount }}
                </UiTd>
                <UiTd class="text-right text-muted">
                  {{ relativeTime(integration.updatedAt) }}
                </UiTd>
              </tr>
            </tbody>
          </UiTable>
        </UiCardBody>
      </UiCard>
    </div>
  </SettingsShell>
</template>
