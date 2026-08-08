<script setup lang="ts">
/**
 * Port of `src/app/(app)/leads/[id]/people/page.tsx`.
 *
 * ⚠️ Deviation: `listLeadPeople()` selected `companyId = lead.companyId OR
 * id = lead.contactId`, so a primary contact stored against a different company
 * still showed. `GET /api/contacts` can only filter on one `companyId`, so this
 * lists the company's people; a primary contact filed elsewhere is missing.
 * Ordering (influence desc, then first name) is the same.
 */
import { computed } from "vue";
import { humanise } from "~/components/leads/constants";
import { useLeadWorkspace } from "~/components/leads/useLeadWorkspace";
import type { ContactListRow } from "~/components/leads/api-types";

const workspace = useLeadWorkspace();
const lead = computed(() => workspace.value.lead);

const { data: people } = await useFetch("/api/contacts", {
  query: computed(() => ({
    companyId: lead.value.companyId,
    sort: "influence",
    dir: "desc",
  })),
  transform: (res: { data: ContactListRow[] }) => res.data,
  default: () => [] as ContactListRow[],
});
</script>

<template>
  <UiCard>
    <UiCardHeader
      title="People"
      description="Everyone recorded at this company, ordered by influence."
    >
      <template #action>
        <NuxtLink :to="`/people/new?companyId=${lead.companyId}`">
          <UiButton size="sm" variant="primary">Add contact</UiButton>
        </NuxtLink>
      </template>
    </UiCardHeader>
    <UiCardBody class="p-0">
      <div v-if="people.length === 0" class="p-4">
        <UiEmptyState
          title="No people yet"
          description="Identify the person who owns the problem before drafting any outreach."
        >
          <template #action>
            <NuxtLink :to="`/people/new?companyId=${lead.companyId}`">
              <UiButton size="sm" variant="primary">Add contact</UiButton>
            </NuxtLink>
          </template>
        </UiEmptyState>
      </div>
      <UiTable v-else>
        <thead>
          <tr>
            <UiTh>Name</UiTh>
            <UiTh>Title</UiTh>
            <UiTh>Decision role</UiTh>
            <UiTh class="text-right">Influence</UiTh>
            <UiTh>Relationship</UiTh>
            <UiTh>Last interaction</UiTh>
          </tr>
        </thead>
        <tbody>
          <tr v-for="person in people" :key="person.id">
            <UiTd>
              <NuxtLink :to="`/people/${person.id}`" class="font-medium hover:text-accent">
                {{ person.firstName }} {{ person.lastName ?? "" }}
              </NuxtLink>
              <UiBadge v-if="person.id === lead.contactId" tone="accent" class="ml-2">
                primary
              </UiBadge>
              <span v-if="person.email" class="block text-xs text-muted">
                {{ person.email }}
              </span>
            </UiTd>
            <UiTd class="text-muted">{{ person.title ?? "—" }}</UiTd>
            <UiTd>
              <UiBadge
                :tone="
                  person.decisionRole === 'DECISION_MAKER'
                    ? 'accent'
                    : person.decisionRole === 'CHAMPION'
                      ? 'positive'
                      : 'neutral'
                "
              >
                {{ humanise(person.decisionRole) }}
              </UiBadge>
            </UiTd>
            <UiTd class="text-right tabular-nums">{{ person.influenceScore }}</UiTd>
            <UiTd class="text-muted">{{ humanise(person.relationshipStatus) }}</UiTd>
            <UiTd class="text-muted">{{ relativeTime(person.lastInteractionAt) }}</UiTd>
          </tr>
        </tbody>
      </UiTable>
    </UiCardBody>
  </UiCard>
</template>
