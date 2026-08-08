<script setup lang="ts">
/** Port of `StageBadge` from `src/components/leads/display.tsx`. */
import type { LeadStage } from "~~/server/generated/prisma/client";
import { STAGE_LABELS, STAGE_TONES } from "./constants";

defineProps<{ stage: LeadStage }>();
</script>

<template>
  <UiBadge :tone="STAGE_TONES[stage]">{{ STAGE_LABELS[stage] }}</UiBadge>
</template>
