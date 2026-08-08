<script setup lang="ts">
/**
 * Port of `src/app/(app)/leads/[id]/activity/page.tsx`.
 *
 * `GET /api/leads/:id/activities` is the server component's two reads in one
 * response: `listLeadActivities()` (200 rows) and `listLeadStageHistory()`.
 * The tab used to read the 8 activities that `GET /api/leads/:id` piggybacks on
 * its overview payload, which silently truncated the list.
 */
import { computed } from "vue";
import ActivityList from "~/components/leads/ActivityList.vue";
import NoteForm from "~/components/leads/NoteForm.vue";
import { addNoteAction } from "~/components/leads/actions";
import { STAGE_LABELS } from "~/components/leads/constants";
import type { ActivityRow } from "~/components/leads/types";
import type { LeadStageHistory } from "~~/server/generated/prisma/client";

const route = useRoute();
const id = computed(() => String(route.params.id));

type ActivityResponse = { activities: ActivityRow[]; history: LeadStageHistory[] };

const { data } = await useFetch(() => `/api/leads/${id.value}/activities`, {
  transform: (res: { data: ActivityResponse }) => res.data,
  default: (): ActivityResponse => ({ activities: [], history: [] }),
  watch: [id],
});

const activities = computed(() => data.value.activities);
const history = computed(() => data.value.history);
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-3">
    <div class="space-y-4 lg:col-span-2">
      <UiCard>
        <UiCardHeader title="Add a note" />
        <UiCardBody>
          <NoteForm :action="addNoteAction" :lead-id="id" />
        </UiCardBody>
      </UiCard>
      <UiCard>
        <UiCardHeader
          title="Activity"
          description="Every recorded event on this lead, newest first."
        />
        <UiCardBody class="pt-0">
          <ActivityList :activities="activities" />
        </UiCardBody>
      </UiCard>
    </div>

    <UiCard class="h-fit">
      <UiCardHeader title="Stage history" description="Who moved it, when, and why." />
      <UiCardBody class="pt-0">
        <UiEmptyState v-if="history.length === 0" title="No stage changes recorded" />
        <ol v-else class="divide-y divide-border">
          <li v-for="entry in history" :key="entry.id" class="py-2">
            <p class="text-sm">
              {{
                entry.previousStage
                  ? `${STAGE_LABELS[entry.previousStage]} to ${STAGE_LABELS[entry.newStage]}`
                  : `Created as ${STAGE_LABELS[entry.newStage]}`
              }}
            </p>
            <p class="text-xs text-muted">
              {{ relativeTime(entry.createdAt) }} · {{ entry.actorType.toLowerCase() }}
            </p>
            <p v-if="entry.reason" class="mt-0.5 text-xs text-muted">{{ entry.reason }}</p>
          </li>
        </ol>
      </UiCardBody>
    </UiCard>
  </div>
</template>
