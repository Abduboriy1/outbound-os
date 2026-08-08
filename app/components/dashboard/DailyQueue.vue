<script setup lang="ts">
/**
 * Port of `DailyQueue` from `src/components/dashboard/queue.tsx`.
 *
 * The Daily Sales Queue (plan §5). Each row is a link straight into the work,
 * so the dashboard is a to-do list rather than a report.
 */
import { computed } from "vue";
import type { Tone } from "~~/shared/tone";
import { cn } from "~/utils/format";

export type QueueItem = {
  key: string;
  label: string;
  count: number;
  href: string;
  tone: Tone;
  hint: string;
};

const props = defineProps<{ items: QueueItem[] }>();

const total = computed(() =>
  props.items.reduce((sum, item) => sum + item.count, 0),
);
</script>

<template>
  <UiCard>
    <UiCardHeader
      title="Today"
      :description="
        total > 0
          ? 'Work through this queue to move the pipeline forward.'
          : 'Nothing is waiting. Add leads or start research to fill the queue.'
      "
    />
    <UiCardBody class="space-y-1 p-2">
      <NuxtLink
        v-for="item in items"
        :key="item.key"
        :to="item.href"
        :class="
          cn(
            'flex items-center gap-3 rounded-md px-2 py-2 transition hover:bg-surface-muted',
            item.count === 0 && 'opacity-60',
          )
        "
      >
        <UiBadge :tone="item.count === 0 ? 'neutral' : item.tone" class="tabular-nums">
          {{ item.count }}
        </UiBadge>
        <span class="min-w-0 flex-1">
          <span class="block text-sm">{{ item.label }}</span>
          <span class="block text-xs text-muted">{{ item.hint }}</span>
        </span>
        <span aria-hidden class="text-xs text-muted">&rarr;</span>
      </NuxtLink>
    </UiCardBody>
  </UiCard>
</template>
