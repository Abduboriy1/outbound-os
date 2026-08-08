<script setup lang="ts">
/**
 * Port of `src/app/(app)/settings/provider-card.tsx`.
 *
 * Plan §35 — every integration says which implementation is live and exactly
 * what is missing before the real one can be used. Mock is a legitimate state,
 * not an error: the app is meant to run end-to-end with no keys at all.
 *
 * React's `action` ReactNode on `CardHeader` becomes the `action` slot.
 */
import { computed } from 'vue'
import type { ProviderStatus } from '~~/shared/settings/providers'

const props = defineProps<{ status: ProviderStatus }>()

const blocking = computed(() => props.status.requirements.filter(r => !r.met))

/** `To switch: …` plus the source's trailing sentence about what is still missing. */
const switchNote = computed(() =>
  `To switch: ${props.status.switchTo}${
    blocking.value.length > 0
      ? ` Still missing: ${blocking.value.map(r => r.label).join(', ')}.`
      : ' Everything required is already configured.'
  }`,
)
</script>

<template>
  <UiCard>
    <UiCardHeader :title="status.title" :description="status.description">
      <template #action>
        <UiBadge :tone="status.isMock ? 'warning' : 'positive'">
          {{ status.isMock ? 'Mock' : status.active }}
        </UiBadge>
      </template>
    </UiCardHeader>
    <UiCardBody class="space-y-2 text-sm">
      <p class="text-xs text-muted">
        Active implementation: <span class="text-foreground">{{ status.active }}</span>
      </p>

      <ul v-if="status.requirements.length > 0" class="space-y-1">
        <li
          v-for="requirement in status.requirements"
          :key="requirement.label"
          class="flex items-center gap-2 text-xs"
        >
          <UiBadge :tone="requirement.met ? 'positive' : 'neutral'">
            {{ requirement.met ? 'set' : 'missing' }}
          </UiBadge>
          <span :class="requirement.met ? '' : 'text-muted'">
            {{ requirement.label }}
          </span>
        </li>
      </ul>

      <p
        v-if="status.isMock && status.switchTo"
        class="rounded-md border border-border bg-surface-muted p-2 text-xs text-muted"
      >
        {{ switchNote }}
      </p>
    </UiCardBody>
  </UiCard>
</template>
