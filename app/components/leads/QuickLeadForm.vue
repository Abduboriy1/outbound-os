<script setup lang="ts">
/**
 * Port of `QuickLeadForm` from `src/components/leads/forms.tsx` —
 * company + first contact + lead in a single submission.
 *
 * The `company.` / `contact.` field-name prefixes are kept, because the action
 * still splits the submitted values on them exactly as `formToObject(fd, "company.")`
 * did.
 */
import { reactive, ref } from "vue";
import { DECISION_ROLES, humanise } from "./constants";
import FormActions from "./FormActions.vue";
import FormErrors from "./FormErrors.vue";
import LeadFields from "./LeadFields.vue";
import type { FormAction, FormState, LeadFieldValues, Option } from "./types";
import type { LeadStage } from "~~/server/generated/prisma/client";

const props = withDefaults(
  defineProps<{
    action: FormAction;
    icps: Option[];
    stages: LeadStage[];
    cancelHref?: string;
  }>(),
  { cancelHref: undefined },
);

const company = reactive({
  name: "",
  domain: "",
  industry: "",
  location: "",
  employeeCount: "",
});

const contact = reactive({
  firstName: "",
  lastName: "",
  title: "",
  email: "",
  decisionRole: "UNKNOWN",
  influenceScore: "0",
});

const lead = ref<LeadFieldValues>({
  companyId: "",
  contactId: "",
  stage: "PROSPECT",
  icpId: "",
  sourceType: "MANUAL",
  sourceDetail: "",
  estimatedValueMin: "",
  estimatedValueMax: "",
  nextAction: "",
  nextActionDueAt: "",
});

const state = ref<FormState>(undefined);
const pending = ref(false);

async function onSubmit() {
  pending.value = true;
  try {
    const values: Record<string, string> = { ...lead.value };
    for (const [key, value] of Object.entries(company)) values[`company.${key}`] = value;
    for (const [key, value] of Object.entries(contact)) values[`contact.${key}`] = value;
    state.value = await props.action(values);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <form class="space-y-5" @submit.prevent="onSubmit">
    <fieldset class="space-y-3">
      <legend class="text-xs font-semibold tracking-wide text-muted uppercase">
        Company
      </legend>
      <UiField label="Company name">
        <UiInput v-model="company.name" name="company.name" required />
      </UiField>
      <div class="grid gap-3 sm:grid-cols-2">
        <UiField label="Domain">
          <UiInput v-model="company.domain" name="company.domain" />
        </UiField>
        <UiField label="Industry">
          <UiInput v-model="company.industry" name="company.industry" />
        </UiField>
        <UiField label="Location">
          <UiInput v-model="company.location" name="company.location" />
        </UiField>
        <UiField label="Employees">
          <UiInput
            v-model="company.employeeCount"
            name="company.employeeCount"
            type="number"
            :min="0"
          />
        </UiField>
      </div>
    </fieldset>

    <fieldset class="space-y-3">
      <legend class="text-xs font-semibold tracking-wide text-muted uppercase">
        First contact (optional)
      </legend>
      <div class="grid gap-3 sm:grid-cols-2">
        <UiField label="First name">
          <UiInput v-model="contact.firstName" name="contact.firstName" />
        </UiField>
        <UiField label="Last name">
          <UiInput v-model="contact.lastName" name="contact.lastName" />
        </UiField>
        <UiField label="Title">
          <UiInput v-model="contact.title" name="contact.title" />
        </UiField>
        <UiField label="Email">
          <UiInput v-model="contact.email" name="contact.email" type="email" />
        </UiField>
        <UiField label="Decision role">
          <UiSelect v-model="contact.decisionRole" name="contact.decisionRole">
            <option v-for="role in DECISION_ROLES" :key="role" :value="role">
              {{ humanise(role) }}
            </option>
          </UiSelect>
        </UiField>
        <UiField label="Influence score" hint="0-100">
          <UiInput
            v-model="contact.influenceScore"
            name="contact.influenceScore"
            type="number"
            :min="0"
            :max="100"
          />
        </UiField>
      </div>
    </fieldset>

    <fieldset class="space-y-3">
      <legend class="text-xs font-semibold tracking-wide text-muted uppercase">
        Lead
      </legend>
      <LeadFields v-model="lead" :icps="icps" :stages="stages" />
    </fieldset>

    <FormErrors :state="state" />
    <FormActions :pending="pending" label="Create lead" :cancel-href="cancelHref" />
  </form>
</template>
