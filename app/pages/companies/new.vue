<script setup lang="ts">
/** Port of `src/app/(app)/companies/new/page.tsx`. */
import CompanyForm from "~/components/leads/CompanyForm.vue";
import { saveCompanyAction } from "~/components/leads/actions";
</script>

<template>
  <div>
    <UiPageHeader
      title="New company"
      description="Companies are the anchor record; contacts and leads attach to them."
    />
    <UiCard class="max-w-3xl">
      <UiCardBody>
        <CompanyForm
          :action="saveCompanyAction"
          submit-label="Create company"
          cancel-href="/companies"
        />
      </UiCardBody>
    </UiCard>
  </div>
</template>
