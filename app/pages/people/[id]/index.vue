<script setup lang="ts">
/** Port of `src/app/(app)/people/[id]/page.tsx`. */
import { computed } from "vue";
import ActivityList from "~/components/leads/ActivityList.vue";
import DeleteForm from "~/components/leads/DeleteForm.vue";
import ScoreBadge from "~/components/leads/ScoreBadge.vue";
import StageBadge from "~/components/leads/StageBadge.vue";
import { deleteContactAction } from "~/components/leads/actions";
import { humanise } from "~/components/leads/constants";
import { formatDate } from "~/components/leads/display";
import type { ContactDetail } from "~/components/leads/api-types";

const route = useRoute();
const id = computed(() => String(route.params.id));

const { data, error } = await useFetch(() => `/api/contacts/${id.value}`, {
  transform: (res: { data: ContactDetail }) => res.data,
  watch: [id],
});

if (error.value || !data.value) {
  throw createError({
    statusCode: error.value?.statusCode ?? 404,
    statusMessage: error.value?.data?.error ?? "Contact not found",
    fatal: true,
  });
}

const contact = computed(() => data.value as ContactDetail);
const fullName = computed(() =>
  `${contact.value.firstName} ${contact.value.lastName ?? ""}`.trim(),
);
</script>

<template>
  <div>
    <UiPageHeader :title="fullName" :description="contact.title ?? undefined">
      <template #action>
        <div class="flex items-center gap-2">
          <NuxtLink :to="`/people/${contact.id}/edit`">
            <UiButton variant="primary">Edit</UiButton>
          </NuxtLink>
          <DeleteForm
            :id="contact.id"
            :action="deleteContactAction"
            :confirm-text="`Delete ${fullName}?`"
          />
        </div>
      </template>
    </UiPageHeader>

    <div class="grid gap-4 lg:grid-cols-3">
      <div class="space-y-4 lg:col-span-2">
        <UiCard>
          <UiCardHeader title="Leads" description="Deals this person is attached to" />
          <UiCardBody class="space-y-2">
            <UiEmptyState
              v-if="contact.leads.length === 0"
              title="Not attached to any lead yet"
            />
            <template v-else>
              <div
                v-for="lead in contact.leads"
                :key="lead.id"
                class="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <div class="min-w-0">
                  <NuxtLink
                    :to="`/leads/${lead.id}`"
                    class="text-sm font-medium hover:text-accent"
                  >
                    {{ lead.company.name }}
                  </NuxtLink>
                  <p class="text-xs text-muted">{{ lead.nextAction ?? "No next action" }}</p>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <ScoreBadge :score="lead.overallScore" />
                  <StageBadge :stage="lead.stage" />
                </div>
              </div>
            </template>
          </UiCardBody>
        </UiCard>

        <UiCard>
          <UiCardHeader title="Notes" />
          <UiCardBody>
            <p v-if="contact.notes" class="text-sm whitespace-pre-wrap">
              {{ contact.notes }}
            </p>
            <p v-else class="text-sm text-muted">No notes recorded.</p>
          </UiCardBody>
        </UiCard>

        <UiCard>
          <UiCardHeader title="Activity" />
          <UiCardBody class="pt-0">
            <ActivityList :activities="contact.activities" />
          </UiCardBody>
        </UiCard>
      </div>

      <div class="space-y-4">
        <UiCard>
          <UiCardHeader title="Details" />
          <UiCardBody>
            <dl class="space-y-2 text-sm">
              <div class="flex justify-between gap-3">
                <dt class="text-muted">Company</dt>
                <dd class="text-right">
                  <NuxtLink
                    v-if="contact.company"
                    :to="`/companies/${contact.company.id}`"
                    class="text-accent hover:underline"
                  >
                    {{ contact.company.name }}
                  </NuxtLink>
                  <template v-else>—</template>
                </dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-muted">Email</dt>
                <dd class="text-right break-all">{{ contact.email ?? "—" }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-muted">Phone</dt>
                <dd class="text-right">{{ contact.phone ?? "—" }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-muted">Profile</dt>
                <dd class="text-right break-all">{{ contact.linkedinUrl ?? "—" }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-muted">Decision role</dt>
                <dd class="text-right">
                  <UiBadge>{{ humanise(contact.decisionRole) }}</UiBadge>
                </dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-muted">Influence</dt>
                <dd class="text-right tabular-nums">{{ contact.influenceScore }}/100</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-muted">Relationship</dt>
                <dd class="text-right">{{ humanise(contact.relationshipStatus) }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-muted">Last interaction</dt>
                <dd class="text-right">
                  {{
                    contact.lastInteractionAt
                      ? `${formatDate(contact.lastInteractionAt)} (${relativeTime(contact.lastInteractionAt)})`
                      : "never"
                  }}
                </dd>
              </div>
            </dl>
          </UiCardBody>
        </UiCard>

        <UiCard>
          <UiCardHeader title="Open tasks" />
          <UiCardBody class="space-y-2">
            <p v-if="contact.tasks.length === 0" class="text-sm text-muted">
              Nothing outstanding.
            </p>
            <template v-else>
              <div v-for="task in contact.tasks" :key="task.id" class="text-sm">
                <p>{{ task.title }}</p>
                <p class="text-xs text-muted">
                  {{ task.dueAt ? `Due ${formatDate(task.dueAt)}` : "No due date" }}
                </p>
              </div>
            </template>
          </UiCardBody>
        </UiCard>
      </div>
    </div>
  </div>
</template>
