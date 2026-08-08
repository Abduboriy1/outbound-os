<script setup lang="ts">
/**
 * Port of `src/app/(app)/outreach/sequences/page.tsx`.
 *
 * Plan §23 — steps by day offset, enrolments, and immediate pause rules.
 *
 *   - `sequencesOverview` → `GET /api/outreach/sequences`
 *   - `enrollableLeads`   → `GET /api/leads` with the stage list spelled out
 */
import { computed } from "vue";
import type { Tone } from "~~/shared/tone";
import EnrolForm from "~/components/outreach/EnrolForm.vue";
import PauseEnrollmentButton from "~/components/outreach/PauseEnrollmentButton.vue";
import RunSequencesButton from "~/components/outreach/RunSequencesButton.vue";
import SequenceBuilder from "~/components/outreach/SequenceBuilder.vue";
import SweepFollowUpsButton from "~/components/outreach/SweepFollowUpsButton.vue";
import {
  ENROLLABLE_STAGES,
  PAUSE_MESSAGES,
} from "~/components/outreach/constants";
import type { PauseReason } from "~/components/outreach/constants";
import { createSequenceAction } from "~/components/outreach/actions";
import type {
  LeadListRow,
  SequenceOverview,
} from "~/components/outreach/types";

const STATUS_TONES: Record<string, Tone> = {
  ACTIVE: "accent",
  PAUSED: "warning",
  COMPLETED: "positive",
  STOPPED: "neutral",
};

const { data: sequences, refresh: refreshSequences } = await useFetch(
  "/api/outreach/sequences",
  {
    transform: (res: { data: SequenceOverview[] }) => res.data,
    default: () => [] as SequenceOverview[],
  },
);

const { data: allLeads, refresh: refreshLeads } = await useFetch("/api/leads", {
  query: {
    stage: ENROLLABLE_STAGES.join(","),
    sort: "score",
    dir: "desc",
  },
  transform: (res: { data: { leads: LeadListRow[]; total: number } }) =>
    res.data.leads,
  default: () => [] as LeadListRow[],
});

/** `enrollableLeads` also required a contact and capped the list at 100. */
const leads = computed(() =>
  allLeads.value.filter((lead) => lead.contact != null).slice(0, 100),
);

const sequenceOptions = computed(() =>
  sequences.value.map((sequence) => ({ id: sequence.id, name: sequence.name })),
);

const leadOptions = computed(() =>
  leads.value.map((lead) => ({
    id: lead.id,
    label: `${lead.company.name} (${lead.stage})`,
  })),
);

async function onResult() {
  await Promise.all([refreshSequences(), refreshLeads()]);
}
</script>

<template>
  <div class="space-y-5">
    <UiPageHeader
      title="Sequences"
      description="Multi-step outreach defined by day offset and purpose. Every generated step still goes to the approval queue, and an enrolment pauses the moment the prospect replies, bounces, or opts out."
    >
      <template #action>
        <div class="flex gap-2">
          <SweepFollowUpsButton @result="onResult" />
          <RunSequencesButton @result="onResult" />
        </div>
      </template>
    </UiPageHeader>

    <UiEmptyState
      v-if="sequences.length === 0"
      title="No sequences yet"
      description="Create one below. The starter steps follow the plan: day 0, 4, 10, 20."
    />
    <template v-else>
      <UiCard v-for="sequence in sequences" :key="sequence.id">
        <UiCardHeader :description="sequence.description ?? undefined">
          <template #title>
            <span class="flex items-center gap-2">
              {{ sequence.name }}
              <UiBadge v-if="!sequence.isActive">Inactive</UiBadge>
            </span>
          </template>
        </UiCardHeader>
        <UiCardBody class="space-y-4">
          <div>
            <p class="text-xs font-medium text-muted">Steps</p>
            <ol class="mt-1 space-y-1 text-sm">
              <li
                v-for="step in sequence.steps"
                :key="step.id"
                class="flex items-center gap-2"
              >
                <UiBadge tone="neutral">Day {{ step.dayOffset }}</UiBadge>
                <span>{{ step.purpose }}</span>
                <span class="text-xs text-muted">{{ step.channel }}</span>
              </li>
            </ol>
          </div>

          <div>
            <p class="text-xs font-medium text-muted">Enrolments</p>
            <p v-if="sequence.enrollments.length === 0" class="mt-1 text-sm text-muted">
              Nobody enrolled yet.
            </p>
            <UiTable v-else class="mt-1">
              <thead>
                <tr>
                  <UiTh>Company</UiTh>
                  <UiTh>Status</UiTh>
                  <UiTh>Step</UiTh>
                  <UiTh>Next run</UiTh>
                  <UiTh />
                </tr>
              </thead>
              <tbody>
                <tr v-for="enrollment in sequence.enrollments" :key="enrollment.id">
                  <UiTd>{{ enrollment.lead.company.name }}</UiTd>
                  <UiTd>
                    <UiBadge :tone="STATUS_TONES[enrollment.status] ?? 'neutral'">
                      {{ enrollment.status }}
                    </UiBadge>
                    <span
                      v-if="enrollment.pausedReason"
                      class="block text-xs text-muted"
                    >
                      {{
                        PAUSE_MESSAGES[enrollment.pausedReason as PauseReason] ??
                        enrollment.pausedReason
                      }}
                    </span>
                  </UiTd>
                  <UiTd class="tabular-nums text-xs">
                    {{ enrollment.currentStep }} / {{ sequence.steps.length }}
                  </UiTd>
                  <UiTd class="text-xs text-muted">
                    {{ enrollment.nextRunAt ? relativeTime(enrollment.nextRunAt) : "—" }}
                  </UiTd>
                  <UiTd>
                    <PauseEnrollmentButton
                      v-if="enrollment.status === 'ACTIVE'"
                      :enrollment-id="enrollment.id"
                      @result="onResult"
                    />
                  </UiTd>
                </tr>
              </tbody>
            </UiTable>
          </div>
        </UiCardBody>
      </UiCard>
    </template>

    <UiCard v-if="sequences.length > 0 && leads.length > 0">
      <UiCardHeader
        title="Enrol a lead"
        description="Leads marked do-not-contact or not a fit are never listed."
      />
      <UiCardBody>
        <EnrolForm
          :sequences="sequenceOptions"
          :leads="leadOptions"
          @result="onResult"
        />
      </UiCardBody>
    </UiCard>

    <UiCard>
      <UiCardHeader
        title="New sequence"
        description="Day offsets are counted from the enrolment date."
      />
      <UiCardBody>
        <SequenceBuilder :action="createSequenceAction" @result="onResult" />
      </UiCardBody>
    </UiCard>
  </div>
</template>
