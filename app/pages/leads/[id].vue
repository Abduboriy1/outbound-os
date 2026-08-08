<script setup lang="ts">
/**
 * Port of `src/app/(app)/leads/[id]/layout.tsx`.
 *
 * Nuxt has no layout at this depth (MIGRATION.md §6), so the lead workspace
 * shell is the *parent route* for everything under `/leads/:id`: this file
 * renders the header, the stage/next-action forms and the tab strip, then
 * `<NuxtPage />` for the active tab. It fetches `/api/leads/:id` once and hands
 * the result to the tabs through `provideLeadWorkspace()`.
 */
import { computed } from "vue";
import DeleteForm from "~/components/leads/DeleteForm.vue";
import LeadTabs from "~/components/leads/LeadTabs.vue";
import NextActionForm from "~/components/leads/NextActionForm.vue";
import ScoreBadge from "~/components/leads/ScoreBadge.vue";
import StageBadge from "~/components/leads/StageBadge.vue";
import StageMoveForm from "~/components/leads/StageMoveForm.vue";
import {
  changeStageAction,
  deleteLeadAction,
  setNextActionAction,
} from "~/components/leads/actions";
import { toDateInputValue } from "~/components/leads/display";
import { provideLeadWorkspace } from "~/components/leads/useLeadWorkspace";
import type { LeadDetailResponse } from "~/components/leads/api-types";
import type { FormValues } from "~/components/leads/types";

const route = useRoute();
const id = computed(() => String(route.params.id));

const { data, error } = await useFetch(() => `/api/leads/${id.value}`, {
  transform: (res: { data: LeadDetailResponse }) => res.data,
  watch: [id],
});

if (error.value || !data.value) {
  throw createError({
    statusCode: error.value?.statusCode ?? 404,
    statusMessage: error.value?.data?.error ?? "Lead not found",
    fatal: true,
  });
}

const workspace = computed(() => data.value as LeadDetailResponse);
provideLeadWorkspace(workspace);

const lead = computed(() => workspace.value.lead);

const setNextAction = (values: FormValues) =>
  setNextActionAction({ id: lead.value.id }, values);
</script>

<template>
  <div class="space-y-4">
    <UiCard>
      <UiCardBody class="space-y-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="text-xl font-semibold">
                <NuxtLink :to="`/companies/${lead.companyId}`" class="hover:text-accent">
                  {{ lead.company.name }}
                </NuxtLink>
              </h1>
              <StageBadge :stage="lead.stage" />
              <UiBadge v-if="lead.icp" tone="accent">{{ lead.icp.name }}</UiBadge>
            </div>
            <p class="mt-1 text-sm text-muted">
              {{ lead.company.industry ?? "Industry unknown" }}
              {{ lead.company.location ? ` · ${lead.company.location}` : "" }}
              {{
                lead.contact
                  ? ` · ${lead.contact.firstName} ${lead.contact.lastName ?? ""}`
                  : " · no contact yet"
              }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <NuxtLink
              :to="`/leads/${lead.id}/edit`"
              class="text-xs text-muted hover:text-foreground"
            >
              Edit lead
            </NuxtLink>
            <DeleteForm
              :id="lead.id"
              :action="deleteLeadAction"
              :confirm-text="`Archive the lead for ${lead.company.name}?`"
              label="Archive"
            />
          </div>
        </div>

        <dl class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-md bg-surface-muted px-3 py-2">
            <dt class="text-xs text-muted">Lead score</dt>
            <dd class="mt-0.5 text-sm"><ScoreBadge :score="lead.overallScore" /></dd>
          </div>
          <div class="rounded-md bg-surface-muted px-3 py-2">
            <dt class="text-xs text-muted">Estimated value</dt>
            <dd class="mt-0.5 text-sm">
              {{ formatRange(lead.estimatedValueMin, lead.estimatedValueMax) }}
            </dd>
          </div>
          <div class="rounded-md bg-surface-muted px-3 py-2">
            <dt class="text-xs text-muted">Last contact</dt>
            <dd class="mt-0.5 text-sm">{{ relativeTime(lead.lastContactedAt) }}</dd>
          </div>
          <div class="rounded-md bg-surface-muted px-3 py-2">
            <dt class="text-xs text-muted">Next action</dt>
            <dd class="mt-0.5 text-sm">
              <span v-if="lead.nextAction">
                {{ lead.nextAction }}
                <span v-if="lead.nextActionDueAt" class="text-muted">
                  · due {{ relativeTime(lead.nextActionDueAt) }}</span
                >
              </span>
              <span v-else class="text-warning">Not set</span>
            </dd>
          </div>
        </dl>

        <div class="grid gap-4 border-t border-border pt-3 lg:grid-cols-2">
          <StageMoveForm
            :action="changeStageAction"
            :lead-id="lead.id"
            :current-stage="lead.stage"
          />
          <NextActionForm
            :action="setNextAction"
            :lead-id="lead.id"
            :next-action="lead.nextAction"
            :next-action-due-at="toDateInputValue(lead.nextActionDueAt)"
          />
        </div>
      </UiCardBody>
    </UiCard>

    <LeadTabs :lead-id="lead.id" />

    <div><NuxtPage /></div>
  </div>
</template>
