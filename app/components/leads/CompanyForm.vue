<script setup lang="ts">
/**
 * Port of `CompanyForm` from `src/components/leads/forms.tsx`.
 *
 * React's uncontrolled inputs (`defaultValue` + `FormData`) become `v-model`
 * over a `values` object seeded from `defaults`; `useActionState` becomes the
 * `state` / `pending` refs around the `action` prop. Native `required` still
 * gates submission, so the browser's own validation fires first exactly as it
 * did.
 */
import { reactive, ref, watch } from "vue";
import FormActions from "./FormActions.vue";
import FormErrors from "./FormErrors.vue";
import type { CompanyDefaults, FormAction, FormState } from "./types";

const props = withDefaults(
  defineProps<{
    action: FormAction;
    defaults?: CompanyDefaults;
    submitLabel?: string;
    cancelHref?: string;
  }>(),
  { defaults: () => ({}), submitLabel: "Save company", cancelHref: undefined },
);

const values = reactive({
  name: "",
  domain: "",
  website: "",
  industry: "",
  location: "",
  employeeCount: "",
  sizeLabel: "",
  linkedinUrl: "",
  phone: "",
  description: "",
});

watch(
  () => props.defaults,
  (defaults) => {
    values.name = defaults.name ?? "";
    values.domain = defaults.domain ?? "";
    values.website = defaults.website ?? "";
    values.industry = defaults.industry ?? "";
    values.location = defaults.location ?? "";
    values.employeeCount = defaults.employeeCount ?? "";
    values.sizeLabel = defaults.sizeLabel ?? "";
    values.linkedinUrl = defaults.linkedinUrl ?? "";
    values.phone = defaults.phone ?? "";
    values.description = defaults.description ?? "";
  },
  { immediate: true, deep: true },
);

const state = ref<FormState>(undefined);
const pending = ref(false);

async function onSubmit() {
  pending.value = true;
  try {
    state.value = await props.action({
      ...(props.defaults.id ? { id: props.defaults.id } : {}),
      ...values,
    });
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <form class="space-y-3" @submit.prevent="onSubmit">
    <input v-if="defaults.id" type="hidden" name="id" :value="defaults.id">
    <UiField label="Company name">
      <UiInput v-model="values.name" name="name" required />
    </UiField>
    <div class="grid gap-3 sm:grid-cols-2">
      <UiField label="Domain" hint="example.com">
        <UiInput v-model="values.domain" name="domain" />
      </UiField>
      <UiField label="Website">
        <UiInput v-model="values.website" name="website" />
      </UiField>
      <UiField label="Industry">
        <UiInput v-model="values.industry" name="industry" />
      </UiField>
      <UiField label="Location">
        <UiInput v-model="values.location" name="location" />
      </UiField>
      <UiField label="Employees">
        <UiInput
          v-model="values.employeeCount"
          name="employeeCount"
          type="number"
          :min="0"
        />
      </UiField>
      <UiField label="Size label" hint="Free text, e.g. mid-market">
        <UiInput v-model="values.sizeLabel" name="sizeLabel" />
      </UiField>
      <UiField label="LinkedIn URL">
        <UiInput v-model="values.linkedinUrl" name="linkedinUrl" />
      </UiField>
      <UiField label="Phone">
        <UiInput v-model="values.phone" name="phone" />
      </UiField>
    </div>
    <UiField label="Description">
      <UiTextarea v-model="values.description" name="description" :rows="3" />
    </UiField>
    <FormErrors :state="state" />
    <FormActions :pending="pending" :label="submitLabel" :cancel-href="cancelHref" />
  </form>
</template>
