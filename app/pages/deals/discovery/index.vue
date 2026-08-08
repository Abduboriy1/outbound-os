<script setup lang="ts">
/**
 * Port of `src/app/(app)/deals/discovery/page.tsx`.
 * Plan §19/§20 — calls to prepare for, and what came out of the ones already held.
 *
 * GAP: the two meeting lists came straight from `prisma.meeting`. MIGRATION.md
 * §4 exposes no meetings endpoint, so they are fetched from the route such an
 * endpoint would occupy (`/api/meetings`) and default to empty. Until that
 * route exists the page renders exactly the "Nothing scheduled" state the
 * source shows for a user with no meetings. The "Waiting on a call" table is
 * fully live off `/api/leads`.
 */
import { relativeTime } from "~/utils/format";
import { STAGE_LABELS, STAGE_TONES } from "~/components/dashboard/constants";
import type { LeadStage } from "~~/server/generated/prisma/client";

type Meeting = {
  id: string;
  title: string;
  scheduledAt: string;
  brief: unknown;
  lead: { id: string; stage: LeadStage } | null;
  company: { name: string } | null;
  contact: { firstName: string; lastName: string | null; title: string | null } | null;
  summaries?: { id: string; summary: string }[];
};

type WaitingLead = {
  id: string;
  stage: LeadStage;
  lastActivityAt: string | null;
  overallScore: number | null;
  company: { name: string };
  _count?: { discoveryQuestions: number };
};

const [{ data: meetings }, { data: waitingLeads }] = await Promise.all([
  useFetch("/api/meetings", {
    key: "discovery-meetings",
    default: () => [] as Meeting[],
    transform: (res) => (res as unknown as { data: Meeting[] }).data,
  }),
  useFetch("/api/leads", {
    key: "discovery-waiting",
    query: { stage: "RESPONDED,DISCOVERY" },
    transform: (res: { data: { leads: WaitingLead[] } }) => res.data.leads,
  }),
]);

const now = Date.now();

const upcoming = computed(() =>
  (meetings.value ?? [])
    .filter((m) => new Date(m.scheduledAt).getTime() >= now)
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))
    .slice(0, 25),
);

const past = computed(() =>
  (meetings.value ?? [])
    .filter((m) => new Date(m.scheduledAt).getTime() < now)
    .sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt))
    .slice(0, 25),
);

/** The source ordered by `lastActivityAt desc`; `/api/leads` has no such sort. */
const waiting = computed(() =>
  [...(waitingLeads.value ?? [])]
    .sort(
      (a, b) =>
        (a.lastActivityAt ? +new Date(a.lastActivityAt) : 0) <
        (b.lastActivityAt ? +new Date(b.lastActivityAt) : 0)
          ? 1
          : -1,
    )
    .slice(0, 25),
);

function scheduledLabel(at: string) {
  return new Date(at).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function attendee(contact: Meeting["contact"]) {
  if (!contact) return "—";
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  return name + (contact.title ? ` (${contact.title})` : "");
}
</script>

<template>
  <div>
    <UiPageHeader
      title="Discovery"
      description="Calls to prepare for, and what the ones already held produced."
    />

    <div class="space-y-4">
      <UiCard>
        <UiCardHeader
          title="Scheduled"
          description="A brief means the discovery agent has already prepared questions for this call."
        />
        <UiCardBody class="p-0">
          <p v-if="upcoming.length === 0" class="p-4 text-sm text-muted">
            Nothing scheduled.
          </p>
          <UiTable v-else>
            <thead>
              <tr>
                <UiTh>When</UiTh>
                <UiTh>Company</UiTh>
                <UiTh>Who</UiTh>
                <UiTh>Call</UiTh>
                <UiTh class="text-right">Brief</UiTh>
              </tr>
            </thead>
            <tbody>
              <tr v-for="meeting in upcoming" :key="meeting.id">
                <UiTd class="whitespace-nowrap">
                  {{ scheduledLabel(meeting.scheduledAt) }}
                </UiTd>
                <UiTd>
                  <NuxtLink
                    v-if="meeting.lead"
                    :to="`/leads/${meeting.lead.id}`"
                    class="hover:text-accent"
                  >
                    {{ meeting.company?.name ?? "—" }}
                  </NuxtLink>
                  <template v-else>{{ meeting.company?.name ?? "—" }}</template>
                </UiTd>
                <UiTd class="text-muted">{{ attendee(meeting.contact) }}</UiTd>
                <UiTd class="text-muted">{{ meeting.title }}</UiTd>
                <UiTd class="text-right">
                  <UiBadge v-if="meeting.brief" tone="positive">Ready</UiBadge>
                  <UiBadge v-else tone="warning">Not prepared</UiBadge>
                </UiTd>
              </tr>
            </tbody>
          </UiTable>
        </UiCardBody>
      </UiCard>

      <UiCard>
        <UiCardHeader
          title="Waiting on a call"
          description="Live conversations that have not yet turned into a scheduled discovery call."
        />
        <UiCardBody class="p-0">
          <p v-if="waiting.length === 0" class="p-4 text-sm text-muted">
            Nothing waiting.
          </p>
          <UiTable v-else>
            <thead>
              <tr>
                <UiTh>Company</UiTh>
                <UiTh>Stage</UiTh>
                <UiTh class="text-right">Score</UiTh>
                <UiTh class="text-right">Questions ready</UiTh>
                <UiTh class="text-right">Last activity</UiTh>
              </tr>
            </thead>
            <tbody>
              <tr v-for="lead in waiting" :key="lead.id">
                <UiTd>
                  <NuxtLink :to="`/leads/${lead.id}`" class="hover:text-accent">
                    {{ lead.company.name }}
                  </NuxtLink>
                </UiTd>
                <UiTd>
                  <UiBadge :tone="STAGE_TONES[lead.stage]">
                    {{ STAGE_LABELS[lead.stage] }}
                  </UiBadge>
                </UiTd>
                <UiTd class="text-right tabular-nums">{{ lead.overallScore ?? "—" }}</UiTd>
                <UiTd class="text-right tabular-nums text-muted">
                  {{ lead._count?.discoveryQuestions ?? "—" }}
                </UiTd>
                <UiTd class="text-right text-muted">
                  {{ relativeTime(lead.lastActivityAt) }}
                </UiTd>
              </tr>
            </tbody>
          </UiTable>
        </UiCardBody>
      </UiCard>

      <UiCard v-if="past.length > 0">
        <UiCardHeader title="Recent calls" />
        <UiCardBody class="space-y-2">
          <div
            v-for="meeting in past"
            :key="meeting.id"
            class="border-b border-border pb-2 last:border-0"
          >
            <div class="flex items-baseline justify-between gap-3">
              <span class="text-sm font-medium">
                {{ meeting.company?.name ?? meeting.title }}
              </span>
              <span class="text-xs text-muted">
                {{ relativeTime(meeting.scheduledAt) }}
              </span>
            </div>
            <p class="mt-0.5 line-clamp-2 text-xs text-muted">
              {{ meeting.summaries?.[0]?.summary ?? "No summary recorded." }}
            </p>
          </div>
        </UiCardBody>
      </UiCard>

      <UiEmptyState
        v-if="upcoming.length === 0 && waiting.length === 0 && past.length === 0"
        title="No discovery activity"
        description="Discovery calls appear here once a prospect replies and a meeting is booked."
      />
    </div>
  </div>
</template>
