<script setup lang="ts">
/** Port of `src/app/(app)/leads/new/page.tsx`. */
import { computed } from "vue";
import LeadForm from "~/components/leads/LeadForm.vue";
import QuickLeadForm from "~/components/leads/QuickLeadForm.vue";
import { quickLeadAction, saveLeadAction } from "~/components/leads/actions";
import { ALL_STAGES } from "~/components/leads/constants";
import { useLeadFormOptions } from "~/components/leads/useOptions";

const route = useRoute();

const { companies, companyChoices, contactChoices, icpChoices } =
  await useLeadFormOptions();

const defaults = computed(() => ({
  companyId: route.query.companyId ? String(route.query.companyId) : "",
}));
</script>

<template>
  <div>
    <UiPageHeader
      title="New lead"
      description="Attach a lead to a company you already track, or create everything at once."
    />

    <div class="grid gap-4 xl:grid-cols-2">
      <UiCard>
        <UiCardHeader
          title="From an existing company"
          description="The company and contact records already exist."
        />
        <UiCardBody>
          <UiEmptyState
            v-if="companies.length === 0"
            title="No companies yet"
            description="Use the form on the right to create a company, contact and lead together."
          />
          <LeadForm
            v-else
            :action="saveLeadAction"
            :companies="companyChoices"
            :contacts="contactChoices"
            :icps="icpChoices"
            :stages="ALL_STAGES"
            submit-label="Create lead"
            cancel-href="/leads"
            :defaults="defaults"
          />
        </UiCardBody>
      </UiCard>

      <UiCard>
        <UiCardHeader
          title="Company, contact and lead"
          description="One form for a prospect you have just found."
        />
        <UiCardBody>
          <QuickLeadForm
            :action="quickLeadAction"
            :icps="icpChoices"
            :stages="ALL_STAGES"
            cancel-href="/leads"
          />
        </UiCardBody>
      </UiCard>
    </div>

    <p class="mt-4 text-xs text-muted">
      Looking for a company that is not listed?
      <NuxtLink to="/companies/new" class="text-accent hover:underline">
        Add it first </NuxtLink
      >.
    </p>
  </div>
</template>
