<script setup lang="ts">
/**
 * Port of `src/app/(app)/outreach/inbox/page.tsx`.
 *
 * Plan §18 — threads with lead context and the AI classification.
 *
 * `inboxThreads(user.id)` is `GET /api/outreach/inbox`, which returns that
 * read model verbatim.
 */
import CheckRepliesButton from "~/components/outreach/CheckRepliesButton.vue";
import {
  INTENT_LABELS,
  INTENT_TONES,
} from "~/components/outreach/intent";
import type { InboxThread, ThreadMessage } from "~/components/outreach/types";

const { data: threads, refresh } = await useFetch("/api/outreach/inbox", {
  transform: (res: { data: InboxThread[] }) => res.data,
  default: () => [] as InboxThread[],
});

/** The read model sorts messages newest-first and takes one. */
function latest(thread: InboxThread): ThreadMessage | undefined {
  return thread.messages[0];
}
</script>

<template>
  <div class="space-y-5">
    <UiPageHeader
      title="Inbox"
      description="Replies matched to leads, classified by the reply agent. Drafted responses land in the approval queue."
    >
      <template #action>
        <CheckRepliesButton @result="refresh()" />
      </template>
    </UiPageHeader>

    <UiEmptyState
      v-if="threads.length === 0"
      title="No conversations yet"
      description="Approve a message in the queue, then check for replies."
    />
    <UiCard v-else>
      <UiCardBody class="p-0">
        <UiTable>
          <thead>
            <tr>
              <UiTh>Company</UiTh>
              <UiTh>Subject</UiTh>
              <UiTh>Latest</UiTh>
              <UiTh>Classification</UiTh>
              <UiTh>When</UiTh>
            </tr>
          </thead>
          <tbody>
            <tr v-for="thread in threads" :key="thread.id">
              <UiTd>
                <NuxtLink
                  :to="`/outreach/inbox/${thread.id}`"
                  class="font-medium hover:underline"
                >
                  {{ thread.lead?.company.name ?? "Unknown company" }}
                </NuxtLink>
                <span v-if="thread.contact" class="block text-xs text-muted">
                  {{ thread.contact.firstName }} {{ thread.contact.lastName ?? "" }}
                </span>
              </UiTd>
              <UiTd class="max-w-64 truncate text-xs">
                {{ thread.subject }}
                <span class="block text-muted">
                  {{ thread._count.messages }} message{{
                    thread._count.messages === 1 ? "" : "s"
                  }}
                </span>
              </UiTd>
              <UiTd class="max-w-80 text-xs text-muted">
                <template v-if="latest(thread)">
                  <UiBadge
                    :tone="latest(thread)!.direction === 'INBOUND' ? 'accent' : 'neutral'"
                  >{{ latest(thread)!.direction === "INBOUND" ? "In" : "Out" }}</UiBadge>
                  {{ latest(thread)!.aiSummary ?? latest(thread)!.snippet ?? "" }}
                </template>
                <template v-else>—</template>
              </UiTd>
              <UiTd class="text-xs">
                <UiBadge
                  v-if="latest(thread)?.intent"
                  :tone="INTENT_TONES[latest(thread)!.intent!]"
                >
                  {{ INTENT_LABELS[latest(thread)!.intent!] }}
                </UiBadge>
                <span v-else class="text-muted">—</span>
                <UiBadge v-if="latest(thread)?.bounced" tone="danger" class="ml-1">
                  Bounced
                </UiBadge>
              </UiTd>
              <UiTd class="text-xs text-muted">
                {{ relativeTime(thread.lastMessageAt) }}
              </UiTd>
            </tr>
          </tbody>
        </UiTable>
      </UiCardBody>
    </UiCard>
  </div>
</template>
