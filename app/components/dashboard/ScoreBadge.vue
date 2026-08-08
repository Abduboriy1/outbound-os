<script setup lang="ts">
/** Port of `ScoreBadge` from `src/components/leads/display.tsx`. */
import type { Tone } from "~~/shared/tone";

const props = defineProps<{ score?: number | null }>();

const tone = computed<Tone>(() => {
  const score = props.score ?? 0;
  if (score >= 75) return "positive";
  if (score >= 50) return "accent";
  if (score >= 25) return "warning";
  return "neutral";
});
</script>

<template>
  <span v-if="score == null" class="text-xs text-muted">unscored</span>
  <UiBadge v-else :tone="tone">{{ score }}</UiBadge>
</template>
