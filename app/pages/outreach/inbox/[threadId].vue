<script setup lang="ts">
/**
 * Port of `src/app/(app)/outreach/inbox/[threadId]/page.tsx`.
 *
 * `threadDetail(user.id, threadId)` is `GET /api/outreach/inbox/:threadId`,
 * which returns that read model verbatim. `notFound()` becomes a fatal 404
 * `createError`, which Nuxt renders through the error page.
 */
import { computed } from "vue";
import type { LeadStage } from "~~/server/generated/prisma/client";
import ReplyComposer from "~/components/outreach/ReplyComposer.vue";
import { STAGE_LABELS, STAGE_TONES } from "~/components/outreach/constants";
import { getObjection } from "~~/shared/outreach/objections";
import {
  INTENT_LABELS,
  INTENT_TONES,
  SENTIMENT_TONES,
} from "~/components/outreach/intent";
import type { ThreadDetail } from "~/components/outreach/types";

const route = useRoute();
const threadId = computed(() => String(route.params.threadId));

const { data: thread, error } = await useFetch(
  () => `/api/outreach/inbox/${threadId.value}`,
  { transform: (res: { data: ThreadDetail }) => res.data },
);

if (!thread.value || error.value) {
  throw createError({ statusCode: 404, statusMessage: "Not Found", fatal: true });
}

const lead = computed(() => thread.value?.lead ?? null);
</script>

<template>
  <div v-if="thread" class="space-y-5">
    <UiPageHeader
      :title="lead?.company.name ?? thread.subject"
      :description="thread.subject"
    >
      <template #action>
        <NuxtLink to="/outreach/inbox" class="text-sm text-muted hover:underline">
          Back to inbox
        </NuxtLink>
      </template>
    </UiPageHeader>

    <div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div class="space-y-3">
        <UiCard v-for="message in thread.messages" :key="message.id">
          <UiCardHeader :description="relativeTime(message.sentAt)">
            <template #title>
              <span class="flex flex-wrap items-center gap-2 text-xs">
                <UiBadge :tone="message.direction === 'INBOUND' ? 'accent' : 'neutral'">
                  {{ message.direction === "INBOUND" ? "Received" : "Sent" }}
                </UiBadge>
                <span class="font-normal text-muted">
                  {{ message.fromEmail }} to {{ message.toEmail }}
                </span>
                <UiBadge v-if="message.bounced" tone="danger">Bounced</UiBadge>
                <UiBadge v-if="message.intent" :tone="INTENT_TONES[message.intent]">
                  {{ INTENT_LABELS[message.intent] }}
                </UiBadge>
                <UiBadge
                  v-if="message.sentiment"
                  :tone="SENTIMENT_TONES[message.sentiment] ?? 'neutral'"
                >
                  {{ message.sentiment.toLowerCase() }}
                </UiBadge>
              </span>
            </template>
          </UiCardHeader>

          <UiCardBody class="space-y-3">
            <pre class="text-xs whitespace-pre-wrap">{{ message.body }}</pre>

            <div
              v-if="message.aiSummary"
              class="rounded-md border border-border bg-surface-muted p-3 text-xs"
            >
              <p class="font-medium">Reply intelligence</p>
              <p class="mt-1 text-muted">{{ message.aiSummary }}</p>

              <div v-if="message.questions.length > 0" class="mt-2">
                <p class="font-medium">Questions</p>
                <ul class="mt-0.5 list-disc pl-4 text-muted">
                  <li v-for="question in message.questions" :key="question">
                    {{ question }}
                  </li>
                </ul>
              </div>

              <div v-if="message.objections.length > 0" class="mt-2">
                <p class="font-medium">Objections</p>
                <ul class="mt-0.5 space-y-1 text-muted">
                  <li v-for="objection in message.objections" :key="objection">
                    <span class="text-foreground">
                      {{ getObjection(objection)?.label ?? objection }}
                    </span>
                    <span v-if="getObjection(objection)" class="block">
                      Ask first: {{ getObjection(objection)!.understandFirst[0] }}
                    </span>
                  </li>
                </ul>
              </div>

              <p v-if="message.recommendedAction" class="mt-2">
                <span class="font-medium">Recommended action: </span>
                <span class="text-muted">{{ message.recommendedAction }}</span>
              </p>
            </div>
          </UiCardBody>
        </UiCard>
      </div>

      <div class="space-y-3">
        <UiCard v-if="lead">
          <UiCardHeader title="Lead context" />
          <UiCardBody class="space-y-2 text-xs">
            <p class="flex items-center gap-2">
              <UiBadge :tone="STAGE_TONES[lead.stage as LeadStage]">
                {{ STAGE_LABELS[lead.stage as LeadStage] }}
              </UiBadge>
              <UiBadge v-if="lead.overallScore != null" tone="accent">
                Score {{ lead.overallScore }}
              </UiBadge>
            </p>
            <p v-if="lead.company.industry" class="text-muted">
              {{ lead.company.industry }}
            </p>
            <p v-if="lead.nextAction">
              <span class="font-medium">Next action: </span>
              <span class="text-muted">
                {{ lead.nextAction
                }}{{
                  lead.nextActionDueAt
                    ? ` (${relativeTime(lead.nextActionDueAt)})`
                    : ""
                }}
              </span>
            </p>
            <p v-else class="text-warning">No next action set.</p>
            <div v-if="lead.opportunities.length > 0">
              <p class="font-medium">Opportunities</p>
              <ul class="mt-0.5 list-disc pl-4 text-muted">
                <li
                  v-for="opportunity in lead.opportunities"
                  :key="opportunity.title"
                >
                  {{ opportunity.title }}
                </li>
              </ul>
            </div>
            <NuxtLink
              :to="`/leads/${lead.id}`"
              class="inline-block text-accent hover:underline"
            >
              Open lead
            </NuxtLink>
          </UiCardBody>
        </UiCard>

        <UiCard>
          <UiCardHeader
            title="Compose"
            description="Drafts only. Approval is required before anything sends."
          />
          <UiCardBody>
            <ReplyComposer v-if="lead" :lead-id="lead.id" />
            <p v-else class="text-xs text-muted">
              This thread is not linked to a lead, so there is nothing to draft
              against.
            </p>
          </UiCardBody>
        </UiCard>
      </div>
    </div>
  </div>
</template>
