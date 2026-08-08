<script setup lang="ts">
/**
 * Port of `src/app/(app)/settings/page.tsx`.
 *
 * The Next version was a server component that ran three Prisma queries and
 * called the `server-only` `providerStatuses()`. Those became
 * `GET /api/settings/overview` and `GET /api/settings/providers`; the derived
 * values (`identityComplete`, `mockCount`, the mode lookup) are computed here
 * exactly as they were there.
 */
import { computed } from 'vue'
import SettingsShell from '~/components/settings/SettingsShell.vue'
import SettingsStatusRow from '~/components/settings/SettingsStatusRow.vue'
import { APPROVAL_MODE_LABELS, AUTOMATION_KEYS } from '~~/shared/settings/automation-keys'
import type { ApprovalMode } from '~~/server/generated/prisma/client'
import type { ProviderStatuses } from '~~/shared/settings/providers'

type Overview = {
  compliance: {
    senderName: string
    senderEmail: string
    physicalAddress: string
    dailySendLimit: number
  } | null
  modes: Record<string, ApprovalMode>
  suppressed: number
}

const { data: providers } = await useFetch('/api/settings/providers', {
  transform: (res: { data: ProviderStatuses }) => res.data,
})
const { data: overview } = await useFetch('/api/settings/overview', {
  transform: (res: { data: Overview }) => res.data,
})

const compliance = computed(() => overview.value?.compliance ?? null)

const identityComplete = computed(() =>
  Boolean(
    compliance.value?.senderName
    && compliance.value?.senderEmail
    && compliance.value?.physicalAddress,
  ),
)

const mockCount = computed(() =>
  providers.value ? Object.values(providers.value).filter(p => p.isMock).length : 0,
)

function modeFor(key: string, fallback: ApprovalMode): ApprovalMode {
  return overview.value?.modes[key] ?? fallback
}
</script>

<template>
  <SettingsShell>
    <div class="space-y-4">
      <UiCard>
        <UiCardHeader
          title="Current state"
          description="What is live right now, in one place."
        />
        <UiCardBody class="space-y-2 text-sm">
          <SettingsStatusRow
            label="Providers"
            :value="
              mockCount === 0
                ? 'All real providers configured'
                : `${mockCount} of 3 running on mock`
            "
            :tone="mockCount === 0 ? 'positive' : 'warning'"
            href="/settings/integrations"
          />
          <SettingsStatusRow
            label="Sender identity"
            :value="
              identityComplete
                ? `${compliance?.senderName} <${compliance?.senderEmail}>`
                : 'Incomplete — email cannot be sent until this is filled in'
            "
            :tone="identityComplete ? 'positive' : 'danger'"
            href="/settings/compliance"
          />
          <SettingsStatusRow
            label="Daily send limit"
            :value="String(compliance?.dailySendLimit ?? 50)"
            tone="neutral"
            href="/settings/compliance"
          />
          <SettingsStatusRow
            label="Suppression list"
            :value="`${overview?.suppressed ?? 0} addresses`"
            tone="neutral"
            href="/settings/compliance"
          />
        </UiCardBody>
      </UiCard>

      <UiCard>
        <UiCardHeader
          title="Approval modes"
          description="Nothing reaches a prospect without a human approving it, whatever else is set here."
        />
        <UiCardBody class="space-y-1 text-sm">
          <div
            v-for="automation in AUTOMATION_KEYS"
            :key="automation.key"
            class="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-1.5 last:border-0"
          >
            <span>
              {{ automation.label }}
              <UiBadge v-if="automation.reachesProspect" tone="accent" class="ml-2">
                reaches prospects
              </UiBadge>
            </span>
            <span class="text-xs text-muted">
              {{ APPROVAL_MODE_LABELS[modeFor(automation.key, automation.default)] }}
            </span>
          </div>
          <p class="pt-2">
            <NuxtLink
              to="/settings/automation"
              class="text-xs text-accent hover:underline"
            >
              Change approval modes
            </NuxtLink>
          </p>
        </UiCardBody>
      </UiCard>
    </div>
  </SettingsShell>
</template>
