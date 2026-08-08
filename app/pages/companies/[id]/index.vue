<script setup lang="ts">
/** Port of `src/app/(app)/companies/[id]/page.tsx`. */
import { computed } from "vue";
import ActivityList from "~/components/leads/ActivityList.vue";
import DeleteForm from "~/components/leads/DeleteForm.vue";
import ScoreBadge from "~/components/leads/ScoreBadge.vue";
import StageBadge from "~/components/leads/StageBadge.vue";
import { deleteCompanyAction } from "~/components/leads/actions";
import type { CompanyDetail } from "~/components/leads/api-types";

const route = useRoute();
const id = computed(() => String(route.params.id));

const { data, error } = await useFetch(() => `/api/companies/${id.value}`, {
  transform: (res: { data: CompanyDetail }) => res.data,
  watch: [id],
});

if (error.value || !data.value) {
  throw createError({
    statusCode: error.value?.statusCode ?? 404,
    statusMessage: error.value?.data?.error ?? "Company not found",
    fatal: true,
  });
}

const company = computed(() => data.value as CompanyDetail);

const facts = computed<[string, string][]>(() => [
  ["Industry", company.value.industry ?? "—"],
  ["Location", company.value.location ?? "—"],
  [
    "Employees",
    company.value.employeeCount != null
      ? String(company.value.employeeCount)
      : (company.value.sizeLabel ?? "—"),
  ],
  ["Domain", company.value.domain ?? "—"],
  ["Phone", company.value.phone ?? "—"],
]);
</script>

<template>
  <div>
    <UiPageHeader
      :title="company.name"
      :description="company.website ?? company.domain ?? undefined"
    >
      <template #action>
        <div class="flex items-center gap-2">
          <NuxtLink :to="`/leads/new?companyId=${company.id}`">
            <UiButton>New lead</UiButton>
          </NuxtLink>
          <NuxtLink :to="`/people/new?companyId=${company.id}`">
            <UiButton>New contact</UiButton>
          </NuxtLink>
          <NuxtLink :to="`/companies/${company.id}/edit`">
            <UiButton variant="primary">Edit</UiButton>
          </NuxtLink>
          <DeleteForm
            :id="company.id"
            :action="deleteCompanyAction"
            label="Delete"
            :confirm-text="`Delete ${company.name}? Its leads are archived with it.`"
          />
        </div>
      </template>
    </UiPageHeader>

    <div class="grid gap-4 lg:grid-cols-3">
      <div class="space-y-4 lg:col-span-2">
        <UiCard>
          <UiCardHeader title="Leads" description="Pipeline entries for this company" />
          <UiCardBody class="p-0">
            <div v-if="company.leads.length === 0" class="p-4">
              <UiEmptyState
                title="No leads yet"
                description="Create a lead to start working this company."
              >
                <template #action>
                  <NuxtLink :to="`/leads/new?companyId=${company.id}`">
                    <UiButton size="sm" variant="primary">New lead</UiButton>
                  </NuxtLink>
                </template>
              </UiEmptyState>
            </div>
            <UiTable v-else>
              <thead>
                <tr>
                  <UiTh>Stage</UiTh>
                  <UiTh>Contact</UiTh>
                  <UiTh class="text-right">Score</UiTh>
                  <UiTh class="text-right">Value</UiTh>
                  <UiTh>Next action</UiTh>
                  <UiTh />
                </tr>
              </thead>
              <tbody>
                <tr v-for="lead in company.leads" :key="lead.id">
                  <UiTd>
                    <StageBadge :stage="lead.stage" />
                  </UiTd>
                  <UiTd class="text-muted">
                    {{
                      lead.contact
                        ? `${lead.contact.firstName} ${lead.contact.lastName ?? ""}`
                        : "—"
                    }}
                  </UiTd>
                  <UiTd class="text-right">
                    <ScoreBadge :score="lead.overallScore" />
                  </UiTd>
                  <UiTd class="text-right tabular-nums">
                    {{ formatRange(lead.estimatedValueMin, lead.estimatedValueMax) }}
                  </UiTd>
                  <UiTd class="text-muted">{{ lead.nextAction ?? "—" }}</UiTd>
                  <UiTd class="text-right">
                    <NuxtLink
                      :to="`/leads/${lead.id}`"
                      class="text-xs text-accent hover:underline"
                    >
                      Open
                    </NuxtLink>
                  </UiTd>
                </tr>
              </tbody>
            </UiTable>
          </UiCardBody>
        </UiCard>

        <UiCard>
          <UiCardHeader
            title="People"
            description="Contacts stored against this company"
          />
          <UiCardBody class="p-0">
            <div v-if="company.contacts.length === 0" class="p-4">
              <UiEmptyState title="No contacts yet" />
            </div>
            <UiTable v-else>
              <thead>
                <tr>
                  <UiTh>Name</UiTh>
                  <UiTh>Title</UiTh>
                  <UiTh>Decision role</UiTh>
                  <UiTh class="text-right">Influence</UiTh>
                  <UiTh>Last interaction</UiTh>
                </tr>
              </thead>
              <tbody>
                <tr v-for="contact in company.contacts" :key="contact.id">
                  <UiTd>
                    <NuxtLink
                      :to="`/people/${contact.id}`"
                      class="font-medium hover:text-accent"
                    >
                      {{ contact.firstName }} {{ contact.lastName ?? "" }}
                    </NuxtLink>
                  </UiTd>
                  <UiTd class="text-muted">{{ contact.title ?? "—" }}</UiTd>
                  <UiTd>
                    <UiBadge>
                      {{ contact.decisionRole.replace(/_/g, " ").toLowerCase() }}
                    </UiBadge>
                  </UiTd>
                  <UiTd class="text-right tabular-nums">{{ contact.influenceScore }}</UiTd>
                  <UiTd class="text-muted">
                    {{ relativeTime(contact.lastInteractionAt) }}
                  </UiTd>
                </tr>
              </tbody>
            </UiTable>
          </UiCardBody>
        </UiCard>
      </div>

      <div class="space-y-4">
        <UiCard>
          <UiCardHeader title="Details" />
          <UiCardBody class="space-y-2">
            <dl class="space-y-2">
              <div
                v-for="[label, value] in facts"
                :key="label"
                class="flex justify-between gap-3 text-sm"
              >
                <dt class="text-muted">{{ label }}</dt>
                <dd class="text-right">{{ value }}</dd>
              </div>
            </dl>
            <p
              v-if="company.description"
              class="border-t border-border pt-2 text-sm whitespace-pre-wrap text-muted"
            >
              {{ company.description }}
            </p>
          </UiCardBody>
        </UiCard>

        <UiCard>
          <UiCardHeader title="Recent activity" />
          <UiCardBody class="pt-0">
            <ActivityList :activities="company.activities" />
          </UiCardBody>
        </UiCard>
      </div>
    </div>
  </div>
</template>
