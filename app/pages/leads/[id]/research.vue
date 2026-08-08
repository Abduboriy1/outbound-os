<script setup lang="ts">
/**
 * Port of `src/app/(app)/leads/[id]/research/page.tsx`.
 *
 * Read-only view of the research subsystem's output. Generation lives with the
 * research work stream; this tab only reports what has been persisted, through
 * the same component the research queue uses so the two cannot drift.
 *
 * The component is the research stream's own
 * `~/components/research/ResearchReportView.vue`, which is where the React
 * original (`src/components/research/report-view.tsx`) belongs; the leads copy
 * that stood in for it while that directory was still being written is gone.
 */
import { computed } from "vue";
import ResearchReportView from "~/components/research/ResearchReportView.vue";

const route = useRoute();
const id = computed(() => String(route.params.id));
</script>

<template>
  <div class="space-y-4">
    <ResearchReportView :lead-id="id" />
    <p class="text-xs text-muted">
      Research runs as a background job.
      <NuxtLink to="/research/queue" class="text-accent">Open the research queue</NuxtLink>
      to start or re-run it.
    </p>
  </div>
</template>
