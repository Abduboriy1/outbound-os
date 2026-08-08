<script setup lang="ts">
/** Port of `LeadCardSummary` from `src/components/leads/display.tsx`. */
import ScoreBadge from "./ScoreBadge.vue";
import type { BoardLead } from "./types";

defineProps<{ lead: BoardLead }>();
</script>

<template>
  <div class="space-y-1">
    <div class="flex items-start justify-between gap-2">
      <NuxtLink :to="`/leads/${lead.id}`" class="text-sm font-medium hover:text-accent">
        {{ lead.company.name }}
      </NuxtLink>
      <ScoreBadge :score="lead.overallScore" />
    </div>
    <p v-if="lead.contact" class="text-xs text-muted">
      {{ lead.contact.firstName }} {{ lead.contact.lastName ?? "" }}
    </p>
    <p v-else class="text-xs text-muted">No contact yet</p>
    <p class="text-xs text-muted">
      {{ formatRange(lead.estimatedValueMin, lead.estimatedValueMax) }}
    </p>
    <p v-if="lead.nextAction" class="text-xs">
      {{ lead.nextAction }}
      <span v-if="lead.nextActionDueAt" class="text-muted">
        · {{ relativeTime(lead.nextActionDueAt) }}</span
      >
    </p>
    <p v-else class="text-xs text-warning">No next action</p>
  </div>
</template>
