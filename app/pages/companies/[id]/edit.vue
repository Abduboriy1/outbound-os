<script setup lang="ts">
/**
 * Port of `src/app/(app)/companies/[id]/edit/page.tsx`.
 *
 * The source read the company row directly; here it is `GET /api/companies/:id`,
 * which returns the same row plus its relations. Only the scalar fields are
 * used, so the form is identical.
 */
import { computed } from "vue";
import CompanyForm from "~/components/leads/CompanyForm.vue";
import { saveCompanyAction } from "~/components/leads/actions";
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

const defaults = computed(() => ({
  id: company.value.id,
  name: company.value.name,
  domain: company.value.domain ?? "",
  website: company.value.website ?? "",
  industry: company.value.industry ?? "",
  location: company.value.location ?? "",
  employeeCount:
    company.value.employeeCount == null ? "" : String(company.value.employeeCount),
  sizeLabel: company.value.sizeLabel ?? "",
  linkedinUrl: company.value.linkedinUrl ?? "",
  phone: company.value.phone ?? "",
  description: company.value.description ?? "",
}));
</script>

<template>
  <div>
    <UiPageHeader :title="`Edit ${company.name}`" />
    <UiCard class="max-w-3xl">
      <UiCardBody>
        <CompanyForm
          :action="saveCompanyAction"
          :cancel-href="`/companies/${company.id}`"
          :defaults="defaults"
        />
      </UiCardBody>
    </UiCard>
  </div>
</template>
