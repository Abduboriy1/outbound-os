<script setup lang="ts">
/**
 * Port of `src/app/(app)/leads/[id]/meetings/page.tsx`.
 * Read-only: briefs and summaries are produced by the discovery work stream.
 *
 * `GET /api/leads/:id/meetings` is the source's query — meetings newest first,
 * with their notes and summaries. `useFetch`, not `useAsyncData` around a bare
 * `$fetch`: see the note in `emails.vue`.
 */
import { computed } from "vue";
import { formatDate } from "~/components/leads/display";
import type {
  Meeting,
  MeetingNote,
  MeetingSummary,
} from "~~/server/generated/prisma/client";

const route = useRoute();
const id = computed(() => String(route.params.id));

type MeetingRow = Meeting & { notes: MeetingNote[]; summaries: MeetingSummary[] };

const { data: meetings } = await useFetch(() => `/api/leads/${id.value}/meetings`, {
  transform: (res: { data: MeetingRow[] }) => res.data,
  default: () => [] as MeetingRow[],
  watch: [id],
});
</script>

<template>
  <UiEmptyState
    v-if="meetings.length === 0"
    title="No meetings recorded"
    description="Scheduled calls, pre-call briefs and meeting summaries appear here."
  />

  <div v-else class="space-y-4">
    <UiCard v-for="meeting in meetings" :key="meeting.id">
      <UiCardHeader
        :title="meeting.title"
        :description="`${formatDate(meeting.scheduledAt)} · ${relativeTime(meeting.scheduledAt)} · ${meeting.durationMin} min`"
      />
      <UiCardBody class="space-y-3">
        <div v-for="summary in meeting.summaries" :key="summary.id">
          <p class="text-xs font-medium text-muted">Summary</p>
          <p class="text-sm whitespace-pre-wrap">{{ summary.summary }}</p>
        </div>
        <div v-if="meeting.notes.length > 0">
          <p class="text-xs font-medium text-muted">Notes</p>
          <ul class="space-y-1">
            <li
              v-for="note in meeting.notes"
              :key="note.id"
              class="text-sm whitespace-pre-wrap"
            >
              {{ note.content }}
            </li>
          </ul>
        </div>
      </UiCardBody>
    </UiCard>
  </div>
</template>
