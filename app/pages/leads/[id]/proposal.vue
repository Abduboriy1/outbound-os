<script setup lang="ts">
/**
 * Port of `src/app/(app)/leads/[id]/proposal/page.tsx`.
 * Read-only: proposal generation belongs to the deal-conversion work stream.
 *
 * `GET /api/leads/:id/proposals` is the source's query — proposals newest
 * first, with their versions. `useFetch`, not `useAsyncData` around a bare
 * `$fetch`: see the note in `emails.vue`.
 */
import { computed } from "vue";
import type { Proposal, ProposalVersion } from "~~/server/generated/prisma/client";

const route = useRoute();
const id = computed(() => String(route.params.id));

type ProposalRow = Proposal & { versions: ProposalVersion[] };

const { data: proposals } = await useFetch(() => `/api/leads/${id.value}/proposals`, {
  transform: (res: { data: ProposalRow[] }) => res.data,
  default: () => [] as ProposalRow[],
  watch: [id],
});
</script>

<template>
  <UiEmptyState
    v-if="proposals.length === 0"
    title="No proposal yet"
    description="Proposal drafts and their versions appear here once one has been built for this lead."
  />

  <div v-else class="space-y-4">
    <UiCard v-for="proposal in proposals" :key="proposal.id">
      <UiCardHeader
        :title="proposal.title"
        :description="
          proposal.sentAt
            ? `Sent ${relativeTime(proposal.sentAt)}`
            : `Created ${relativeTime(proposal.createdAt)}`
        "
      >
        <template #action>
          <UiBadge>{{ proposal.status.toLowerCase() }}</UiBadge>
        </template>
      </UiCardHeader>
      <UiCardBody class="space-y-2">
        <p v-if="proposal.versions.length === 0" class="text-sm text-muted">
          No versions recorded.
        </p>
        <template v-else>
          <div
            v-for="version in proposal.versions"
            :key="version.id"
            class="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
          >
            <span>Version {{ version.version }}</span>
            <span class="text-muted">
              {{ formatRange(version.investmentMin, version.investmentMax) }}
            </span>
            <span class="text-xs text-muted">{{ relativeTime(version.createdAt) }}</span>
          </div>
        </template>
      </UiCardBody>
    </UiCard>
  </div>
</template>
