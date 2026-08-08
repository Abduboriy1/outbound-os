<script setup lang="ts">
/** Port of `src/app/(app)/people/[id]/edit/page.tsx`. */
import { computed } from "vue";
import ContactForm from "~/components/leads/ContactForm.vue";
import { saveContactAction } from "~/components/leads/actions";
import { toDateInputValue } from "~/components/leads/display";
import { toCompanyChoices, useCompanyOptions } from "~/components/leads/useOptions";
import type { ContactDetail } from "~/components/leads/api-types";

const route = useRoute();
const id = computed(() => String(route.params.id));

// Both are started before the first `await`, so neither composable runs outside
// the Nuxt instance context.
const contactRequest = useFetch(() => `/api/contacts/${id.value}`, {
  transform: (res: { data: ContactDetail }) => res.data,
  watch: [id],
});

const companiesRequest = useCompanyOptions();

const [{ data, error }, { data: companies }] = await Promise.all([
  contactRequest,
  companiesRequest,
]);

if (error.value || !data.value) {
  throw createError({
    statusCode: error.value?.statusCode ?? 404,
    statusMessage: error.value?.data?.error ?? "Contact not found",
    fatal: true,
  });
}

const contact = computed(() => data.value as ContactDetail);
const companyChoices = computed(() => toCompanyChoices(companies.value));

const defaults = computed(() => ({
  id: contact.value.id,
  firstName: contact.value.firstName,
  lastName: contact.value.lastName ?? "",
  title: contact.value.title ?? "",
  email: contact.value.email ?? "",
  phone: contact.value.phone ?? "",
  linkedinUrl: contact.value.linkedinUrl ?? "",
  companyId: contact.value.companyId ?? "",
  decisionRole: contact.value.decisionRole,
  influenceScore: String(contact.value.influenceScore),
  relationshipStatus: contact.value.relationshipStatus,
  lastInteractionAt: toDateInputValue(contact.value.lastInteractionAt),
  notes: contact.value.notes ?? "",
}));
</script>

<template>
  <div>
    <UiPageHeader
      :title="`Edit ${contact.firstName} ${contact.lastName ?? ''}`"
    />
    <UiCard class="max-w-3xl">
      <UiCardBody>
        <ContactForm
          :action="saveContactAction"
          :cancel-href="`/people/${contact.id}`"
          :companies="companyChoices"
          :defaults="defaults"
        />
      </UiCardBody>
    </UiCard>
  </div>
</template>
