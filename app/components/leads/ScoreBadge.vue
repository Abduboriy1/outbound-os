<script setup lang="ts">
/** Port of `ScoreBadge` from `src/components/leads/display.tsx`. */
import { scoreTone } from "./display";

defineProps<{ score?: number | null }>();
</script>

<template>
  <span v-if="score == null" class="text-xs text-muted">unscored</span>
  <UiBadge v-else :tone="scoreTone(score)">{{ score }}</UiBadge>
</template>
