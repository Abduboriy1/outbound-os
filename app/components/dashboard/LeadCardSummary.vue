<script setup lang="ts">
/**
 * Port of `LeadCardSummary` from `src/components/leads/display.tsx`.
 *
 * It lives here rather than in `app/components/leads/` because the pipeline
 * board is the only page in this agent's scope that renders it and
 * `app/components/leads/` belongs to the leads agent. If that directory gains a
 * copy, delete this one and point the board at it.
 */
import { formatRange, relativeTime } from "~/utils/format";
import type { LeadStage } from "~~/server/generated/prisma/client";

export type BoardLead = {
  id: string;
  stage: LeadStage;
  overallScore: number | null;
  estimatedValueMin: number | null;
  estimatedValueMax: number | null;
  nextAction: string | null;
  nextActionDueAt: string | null;
  company: { id: string; name: string };
  contact: { firstName: string; lastName: string | null } | null;
};

defineProps<{ lead: BoardLead }>();
</script>

<template>
  <div class="space-y-1">
    <div class="flex items-start justify-between gap-2">
      <NuxtLink
        :to="`/leads/${lead.id}`"
        class="text-sm font-medium hover:text-accent"
      >
        {{ lead.company.name }}
      </NuxtLink>
      <DashboardScoreBadge :score="lead.overallScore" />
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
        · {{ relativeTime(lead.nextActionDueAt) }}
      </span>
    </p>
    <p v-else class="text-xs text-warning">No next action</p>
  </div>
</template>
