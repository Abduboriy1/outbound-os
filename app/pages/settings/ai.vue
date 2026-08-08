<script setup lang="ts">
/**
 * Port of `src/app/(app)/settings/ai/page.tsx` — plan §31/§36: what the AI is,
 * and what it is allowed to read.
 *
 * The server component's `groupBy` / `findMany` / `count` trio is now
 * `GET /api/settings/ai`, which flattens Prisma's `_count._all` to a plain
 * `count`. Everything derived from it (the sorted agent list, the per-agent
 * success/failed lookup) is unchanged.
 */
import { computed } from 'vue'
import SettingsProviderCard from '~/components/settings/SettingsProviderCard.vue'
import SettingsRule from '~/components/settings/SettingsRule.vue'
import SettingsShell from '~/components/settings/SettingsShell.vue'
import type { ProviderStatuses } from '~~/shared/settings/providers'

type RunStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED'

type AiSettings = {
  byAgent: { agent: string, status: RunStatus, count: number }[]
  recent: {
    id: string
    agent: string
    status: RunStatus
    model: string | null
    latencyMs: number | null
    createdAt: string
    error: string | null
  }[]
  failures: number
}

const { data: providers } = await useFetch('/api/settings/providers', {
  transform: (res: { data: ProviderStatuses }) => res.data,
})
const { data } = await useFetch('/api/settings/ai', {
  transform: (res: { data: AiSettings }) => res.data,
})

const byAgent = computed(() => data.value?.byAgent ?? [])
const recent = computed(() => data.value?.recent ?? [])
const failures = computed(() => data.value?.failures ?? 0)

const agents = computed(() => [...new Set(byAgent.value.map(row => row.agent))].sort())

function countFor(agent: string, status: RunStatus) {
  return byAgent.value.find(r => r.agent === agent && r.status === status)?.count ?? 0
}

const activityDescription = computed(() =>
  failures.value > 0
    ? `${failures.value} runs have failed. A failure means the model returned something that did not match its schema, and nothing was stored.`
    : 'No failed runs.',
)

function statusTone(status: RunStatus) {
  if (status === 'SUCCESS') return 'positive'
  if (status === 'FAILED') return 'danger'
  return 'neutral'
}
</script>

<template>
  <SettingsShell>
    <div class="space-y-4">
      <SettingsProviderCard v-if="providers" :status="providers.ai" />

      <UiCard>
        <UiCardHeader
          title="How prospect data is handled"
          description="These are properties of the code, not options."
        />
        <UiCardBody class="space-y-1 text-sm text-muted">
          <SettingsRule
            text="Scraped pages and prospect emails travel as untrusted documents, never inside a system prompt."
          />
          <SettingsRule
            text="Instructions found inside researched content are ignored; the agents are told so explicitly."
          />
          <SettingsRule
            text="Every agent returns JSON validated against a schema before anything is stored."
          />
          <SettingsRule
            text="Each claim is typed FACT, INFERENCE or UNKNOWN and carries its source."
          />
          <SettingsRule
            text="Every call is recorded as an AiRun with the sanitised input actually sent."
          />
        </UiCardBody>
      </UiCard>

      <UiCard>
        <UiCardHeader title="Agent activity" :description="activityDescription" />
        <UiCardBody class="p-0">
          <p v-if="agents.length === 0" class="p-4 text-sm text-muted">
            No AI runs yet.
          </p>
          <UiTable v-else>
            <thead>
              <tr>
                <UiTh>Agent</UiTh>
                <UiTh class="text-right">Success</UiTh>
                <UiTh class="text-right">Failed</UiTh>
              </tr>
            </thead>
            <tbody>
              <tr v-for="agent in agents" :key="agent">
                <UiTd>{{ agent }}</UiTd>
                <UiTd class="text-right tabular-nums">
                  {{ countFor(agent, 'SUCCESS') }}
                </UiTd>
                <UiTd class="text-right tabular-nums text-muted">
                  {{ countFor(agent, 'FAILED') }}
                </UiTd>
              </tr>
            </tbody>
          </UiTable>
        </UiCardBody>
      </UiCard>

      <UiCard v-if="recent.length > 0">
        <UiCardHeader title="Recent runs" />
        <UiCardBody class="p-0">
          <UiTable>
            <thead>
              <tr>
                <UiTh>Agent</UiTh>
                <UiTh>Status</UiTh>
                <UiTh>Model</UiTh>
                <UiTh class="text-right">Latency</UiTh>
                <UiTh class="text-right">When</UiTh>
              </tr>
            </thead>
            <tbody>
              <tr v-for="run in recent" :key="run.id">
                <UiTd>{{ run.agent }}</UiTd>
                <UiTd>
                  <UiBadge :tone="statusTone(run.status)">
                    {{ run.status.toLowerCase() }}
                  </UiBadge>
                  <span v-if="run.error" class="ml-2 text-xs text-muted">
                    {{ run.error }}
                  </span>
                </UiTd>
                <UiTd class="text-muted">{{ run.model ?? '—' }}</UiTd>
                <UiTd class="text-right tabular-nums text-muted">
                  {{ run.latencyMs == null ? '—' : `${run.latencyMs}ms` }}
                </UiTd>
                <UiTd class="text-right text-muted">
                  {{ relativeTime(run.createdAt) }}
                </UiTd>
              </tr>
            </tbody>
          </UiTable>
        </UiCardBody>
      </UiCard>
    </div>
  </SettingsShell>
</template>
