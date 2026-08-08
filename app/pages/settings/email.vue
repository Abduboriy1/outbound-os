<script setup lang="ts">
/**
 * Port of `src/app/(app)/settings/email/page.tsx` — plan §37: sending health,
 * i.e. the provider, today's volume, and domain setup.
 *
 * `GET /api/settings/email` replaces the server component's three reads. The
 * DNS checklist is static data and moved to `shared/settings/providers.ts`, so
 * it still renders without a round trip.
 */
import { computed } from 'vue'
import SettingsProviderCard from '~/components/settings/SettingsProviderCard.vue'
import SettingsRule from '~/components/settings/SettingsRule.vue'
import SettingsShell from '~/components/settings/SettingsShell.vue'
import { DNS_CHECKLIST } from '~~/shared/settings/providers'
import type { ProviderStatuses } from '~~/shared/settings/providers'

type EmailSettings = {
  dailySendLimit: number
  senderEmail: string | null
  sentToday: number
  stats: { bounceRate: number, optOutRate: number, replyRate: number }
}

const { data: providers } = await useFetch('/api/settings/providers', {
  transform: (res: { data: ProviderStatuses }) => res.data,
})
const { data } = await useFetch('/api/settings/email', {
  transform: (res: { data: EmailSettings }) => res.data,
})

const sentToday = computed(() => data.value?.sentToday ?? 0)
const limit = computed(() => data.value?.dailySendLimit ?? 50)
const stats = computed(
  () => data.value?.stats ?? { bounceRate: 0, optOutRate: 0, replyRate: 0 },
)

const senderDomain = computed(() => data.value?.senderEmail?.split('@')[1] ?? null)

const domainDescription = computed(() =>
  senderDomain.value
    ? `Records to publish on ${senderDomain.value}. The app cannot read your DNS, so treat this as a checklist rather than a status.`
    : 'Set a sender email under Compliance first, then publish these records on that domain.',
)
</script>

<template>
  <SettingsShell>
    <div class="space-y-4">
      <SettingsProviderCard v-if="providers" :status="providers.email" />

      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <UiStatCard
          label="Sent today"
          :value="`${sentToday} / ${limit}`"
          :tone="sentToday >= limit ? 'warning' : 'neutral'"
          sub="Resets at 00:00 UTC"
        />
        <UiStatCard
          label="Bounce rate"
          :value="`${stats.bounceRate}%`"
          :tone="stats.bounceRate > 3 ? 'danger' : 'neutral'"
          sub="Keep under 3%"
        />
        <UiStatCard
          label="Opt-out rate"
          :value="`${stats.optOutRate}%`"
          :tone="stats.optOutRate > 1 ? 'warning' : 'neutral'"
          sub="Keep under 1%"
        />
        <UiStatCard
          label="Reply rate"
          :value="`${stats.replyRate}%`"
          :tone="stats.replyRate > 0 ? 'positive' : 'neutral'"
        />
      </div>

      <UiCard>
        <UiCardHeader title="Domain authentication" :description="domainDescription" />
        <UiCardBody class="space-y-3">
          <div
            v-for="item in DNS_CHECKLIST"
            :key="item.record"
            class="border-b border-border pb-3 last:border-0"
          >
            <div class="flex items-center gap-2">
              <UiBadge tone="accent">{{ item.record }}</UiBadge>
              <span class="text-sm">{{ item.what }}</span>
            </div>
            <pre class="mt-1 overflow-x-auto rounded-md bg-surface-muted p-2 text-xs">{{ item.example }}</pre>
            <p class="mt-1 text-xs text-muted">{{ item.why }}</p>
          </div>
        </UiCardBody>
      </UiCard>

      <UiCard>
        <UiCardHeader
          title="Sending rules"
          description="Plan §37 — this product is built for targeted outreach, not bulk cold email."
        />
        <UiCardBody class="space-y-1 text-sm text-muted">
          <SettingsRule
            text="Nothing is sent without a human approving that exact message."
          />
          <SettingsRule
            text="Every message carries a real sender identity, a physical address and an opt-out line."
          />
          <SettingsRule
            text="Suppressed addresses are never contacted again, whatever the pipeline says."
          />
          <SettingsRule
            text="Subjects describe the message honestly; no fabricated reply chains."
          />
          <SettingsRule
            text="Sends stop at the daily limit rather than queueing up overnight."
          />
          <p class="pt-2">
            <NuxtLink
              to="/settings/compliance"
              class="text-xs text-accent hover:underline"
            >
              Edit sender identity and the suppression list
            </NuxtLink>
          </p>
        </UiCardBody>
      </UiCard>
    </div>
  </SettingsShell>
</template>
