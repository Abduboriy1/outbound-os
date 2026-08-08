<script setup lang="ts">
/** Port of `ActivityList` from `src/components/leads/display.tsx`. */
import type { ActivityRow } from "./types";

withDefaults(
  defineProps<{
    activities: ActivityRow[];
    emptyTitle?: string;
    emptyDescription?: string;
  }>(),
  { emptyTitle: "No activity yet", emptyDescription: undefined },
);
</script>

<template>
  <UiEmptyState
    v-if="!activities.length"
    :title="emptyTitle"
    :description="emptyDescription"
  />

  <ol v-else class="divide-y divide-border">
    <li v-for="activity in activities" :key="activity.id" class="flex gap-3 py-2.5">
      <div class="min-w-0 flex-1">
        <p class="text-sm">{{ activity.summary }}</p>
        <p
          v-if="activity.detail && activity.detail !== activity.summary"
          class="mt-0.5 text-xs whitespace-pre-wrap text-muted"
        >
          {{ activity.detail }}
        </p>
      </div>
      <div class="shrink-0 space-y-1 text-right">
        <p class="text-xs text-muted">{{ relativeTime(activity.occurredAt) }}</p>
        <UiBadge :tone="activity.actorType === 'HUMAN' ? 'neutral' : 'accent'">
          {{ activity.actorType.toLowerCase() }}
        </UiBadge>
      </div>
    </li>
  </ol>
</template>
