<script setup lang="ts">
/** Port of `src/app/(app)/people/new/page.tsx`. */
import { computed } from "vue";
import ContactForm from "~/components/leads/ContactForm.vue";
import { saveContactAction } from "~/components/leads/actions";
import { toCompanyChoices, useCompanyOptions } from "~/components/leads/useOptions";

const route = useRoute();

const { data: companies } = await useCompanyOptions();
const companyChoices = computed(() => toCompanyChoices(companies.value));

const defaults = computed(() => ({
  companyId: route.query.companyId ? String(route.query.companyId) : "",
}));
</script>

<template>
  <div>
    <UiPageHeader
      title="New contact"
      description="Record who owns the problem, not just who answers the phone."
    />
    <UiCard class="max-w-3xl">
      <UiCardBody>
        <ContactForm
          :action="saveContactAction"
          cancel-href="/people"
          submit-label="Create contact"
          :companies="companyChoices"
          :defaults="defaults"
        />
      </UiCardBody>
    </UiCard>
  </div>
</template>
