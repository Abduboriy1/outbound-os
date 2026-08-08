<script setup lang="ts">
/** Port of `src/app/(app)/leads/[id]/page.tsx` — the Overview tab. */
import { computed } from "vue";
import ActivityList from "~/components/leads/ActivityList.vue";
import LogContactForm from "~/components/leads/LogContactForm.vue";
import NoteForm from "~/components/leads/NoteForm.vue";
import { addNoteAction, logContactAction } from "~/components/leads/actions";
import { STAGE_LABELS } from "~/components/leads/constants";
import { formatDate } from "~/components/leads/display";
import { useLeadWorkspace } from "~/components/leads/useLeadWorkspace";

const workspace = useLeadWorkspace();

const lead = computed(() => workspace.value.lead);
const overview = computed(() => workspace.value);
const score = computed(() => lead.value.scores[0]);

/** The primary contact stands in when nobody is linked to the lead yet. */
const keyPeople = computed(() => {
  if (overview.value.contacts.length) return overview.value.contacts;
  return lead.value.contact ? [lead.value.contact] : [];
});
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-3">
    <div class="space-y-4 lg:col-span-2">
      <div class="grid gap-3 sm:grid-cols-4">
        <UiStatCard label="Fit score" :value="lead.fitScore ?? '—'" />
        <UiStatCard label="Opportunity" :value="lead.opportunityScore ?? '—'" />
        <UiStatCard
          label="Overall"
          :value="lead.overallScore ?? '—'"
          :tone="lead.overallScore != null && lead.overallScore >= 70 ? 'positive' : 'neutral'"
        />
        <UiStatCard
          label="Estimated value"
          :value="formatRange(lead.estimatedValueMin, lead.estimatedValueMax)"
        />
      </div>

      <UiCard v-if="score?.rationale">
        <UiCardHeader
          title="Why this score"
          :description="`Recorded ${relativeTime(score.createdAt)}`"
        />
        <UiCardBody>
          <p class="text-sm whitespace-pre-wrap">{{ score.rationale }}</p>
        </UiCardBody>
      </UiCard>

      <UiCard>
        <UiCardHeader title="Log what happened" />
        <UiCardBody class="space-y-4">
          <LogContactForm :action="logContactAction" :lead-id="lead.id" />
          <div class="border-t border-border pt-4">
            <NoteForm :action="addNoteAction" :lead-id="lead.id" />
          </div>
        </UiCardBody>
      </UiCard>

      <UiCard>
        <UiCardHeader title="Recent activity">
          <template #action>
            <NuxtLink
              :to="`/leads/${lead.id}/activity`"
              class="text-xs text-accent hover:underline"
            >
              View all
            </NuxtLink>
          </template>
        </UiCardHeader>
        <UiCardBody class="pt-0">
          <ActivityList
            :activities="overview.activities"
            empty-title="Nothing has happened yet"
            empty-description="Log a conversation or move the stage to start the history."
          />
        </UiCardBody>
      </UiCard>
    </div>

    <div class="space-y-4">
      <UiCard>
        <UiCardHeader title="Company" />
        <UiCardBody>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between gap-3">
              <dt class="text-muted">Industry</dt>
              <dd class="text-right">{{ lead.company.industry ?? "—" }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-muted">Location</dt>
              <dd class="text-right">{{ lead.company.location ?? "—" }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-muted">Employees</dt>
              <dd class="text-right">
                {{ lead.company.employeeCount ?? lead.company.sizeLabel ?? "—" }}
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-muted">Website</dt>
              <dd class="text-right break-all">
                {{ lead.company.website ?? lead.company.domain ?? "—" }}
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-muted">Source</dt>
              <dd class="text-right">
                {{ lead.sourceType.replace(/_/g, " ").toLowerCase() }}
              </dd>
            </div>
          </dl>
        </UiCardBody>
      </UiCard>

      <UiCard>
        <UiCardHeader title="Key people">
          <template #action>
            <NuxtLink
              :to="`/leads/${lead.id}/people`"
              class="text-xs text-accent hover:underline"
            >
              Manage
            </NuxtLink>
          </template>
        </UiCardHeader>
        <UiCardBody class="space-y-2">
          <p v-if="keyPeople.length === 0" class="text-sm text-muted">
            No contact identified yet.
          </p>
          <template v-else>
            <div
              v-for="contact in keyPeople"
              :key="contact.id"
              class="flex items-center justify-between gap-2"
            >
              <NuxtLink :to="`/people/${contact.id}`" class="text-sm hover:text-accent">
                {{ contact.firstName }} {{ contact.lastName ?? "" }}
              </NuxtLink>
              <UiBadge>
                {{ contact.decisionRole.replace(/_/g, " ").toLowerCase() }}
              </UiBadge>
            </div>
          </template>
        </UiCardBody>
      </UiCard>

      <UiCard>
        <UiCardHeader title="Open tasks">
          <template #action>
            <NuxtLink
              :to="`/leads/${lead.id}/tasks`"
              class="text-xs text-accent hover:underline"
            >
              Manage
            </NuxtLink>
          </template>
        </UiCardHeader>
        <UiCardBody class="space-y-2">
          <p v-if="overview.tasks.length === 0" class="text-sm text-muted">
            Nothing outstanding.
          </p>
          <template v-else>
            <div v-for="task in overview.tasks" :key="task.id" class="text-sm">
              <p>{{ task.title }}</p>
              <p class="text-xs text-muted">
                {{ task.dueAt ? `Due ${formatDate(task.dueAt)}` : "No due date" }}
              </p>
            </div>
          </template>
        </UiCardBody>
      </UiCard>

      <UiCard>
        <UiCardHeader title="Stage history" />
        <UiCardBody class="pt-0">
          <UiEmptyState
            v-if="overview.stageHistory.length === 0"
            title="No stage changes recorded"
          />
          <ol v-else class="divide-y divide-border">
            <li v-for="entry in overview.stageHistory" :key="entry.id" class="py-2">
              <p class="text-sm">
                {{
                  entry.previousStage
                    ? `${STAGE_LABELS[entry.previousStage]} to ${STAGE_LABELS[entry.newStage]}`
                    : `Created as ${STAGE_LABELS[entry.newStage]}`
                }}
              </p>
              <p class="text-xs text-muted">
                {{ relativeTime(entry.createdAt) }} · {{ entry.actorType.toLowerCase()
                }}{{ entry.reason ? ` · ${entry.reason}` : "" }}
              </p>
            </li>
          </ol>
        </UiCardBody>
      </UiCard>
    </div>
  </div>
</template>
