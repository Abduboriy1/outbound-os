<script setup lang="ts">
/**
 * Port of `src/app/(app)/leads/[id]/emails/page.tsx`.
 * Read-only: sending, drafting and reply analysis belong to the outreach stream.
 *
 * The source read `emailThread` and `outreachDraft` straight from Prisma;
 * `GET /api/leads/:id/emails` is those two reads, shaped `{ threads, drafts }`.
 *
 * This must be `useFetch`, not `useAsyncData` around a bare `$fetch`:
 * `$fetch` forwards no headers on the server, so during SSR the request
 * arrived without `ase_session`, came back 401, and the tab rendered its empty
 * state on every hard load even when the lead had threads (MIGRATION.md §5.1).
 */
import { computed } from "vue";
import type {
  EmailMessage,
  EmailThread,
  OutreachDraft,
} from "~~/server/generated/prisma/client";

const route = useRoute();
const id = computed(() => String(route.params.id));

type EmailsPayload = {
  threads: (EmailThread & { messages: EmailMessage[] })[];
  drafts: OutreachDraft[];
};

const { data } = await useFetch(() => `/api/leads/${id.value}/emails`, {
  transform: (res: { data: EmailsPayload }) => res.data,
  default: (): EmailsPayload => ({ threads: [], drafts: [] }),
  watch: [id],
});

const threads = computed(() => data.value?.threads ?? []);
const drafts = computed(() => data.value?.drafts ?? []);
</script>

<template>
  <UiEmptyState
    v-if="threads.length === 0 && drafts.length === 0"
    title="No email activity"
    description="Approved outreach and replies appear here once the outreach subsystem has run."
  />

  <div v-else class="space-y-4">
    <UiCard v-if="drafts.length > 0">
      <UiCardHeader title="Drafts" description="Nothing is sent without approval." />
      <UiCardBody class="space-y-3">
        <div
          v-for="draft in drafts"
          :key="draft.id"
          class="rounded-md border border-border p-3"
        >
          <div class="flex items-start justify-between gap-2">
            <p class="text-sm font-medium">{{ draft.subject ?? "No subject" }}</p>
            <UiBadge
              :tone="
                draft.status === 'SENT'
                  ? 'positive'
                  : draft.status === 'REJECTED' || draft.status === 'FAILED'
                    ? 'danger'
                    : 'warning'
              "
            >
              {{ draft.status.replace(/_/g, " ").toLowerCase() }}
            </UiBadge>
          </div>
          <p class="mt-1 text-xs whitespace-pre-wrap text-muted">{{ draft.body }}</p>
        </div>
      </UiCardBody>
    </UiCard>

    <UiCard v-for="thread in threads" :key="thread.id">
      <UiCardHeader
        :title="thread.subject"
        :description="`${thread.messages.length} message${thread.messages.length === 1 ? '' : 's'} · ${relativeTime(thread.lastMessageAt)}`"
      />
      <UiCardBody class="space-y-3">
        <div
          v-for="message in thread.messages"
          :key="message.id"
          class="rounded-md border border-border p-3"
        >
          <div class="flex items-center justify-between gap-2 text-xs text-muted">
            <span>
              {{ message.direction === "OUTBOUND" ? "To" : "From" }}
              {{ message.direction === "OUTBOUND" ? message.toEmail : message.fromEmail }}
            </span>
            <span>{{ relativeTime(message.sentAt) }}</span>
          </div>
          <p class="mt-1 text-sm whitespace-pre-wrap">{{ message.body }}</p>
          <UiBadge v-if="message.intent" tone="accent" class="mt-2">
            {{ message.intent.replace(/_/g, " ").toLowerCase() }}
          </UiBadge>
        </div>
      </UiCardBody>
    </UiCard>
  </div>
</template>
