<script setup lang="ts">
/** Port of `ContactForm` from `src/components/leads/forms.tsx`. */
import { reactive, ref, watch } from "vue";
import { DECISION_ROLES, RELATIONSHIP_STATUSES, humanise } from "./constants";
import FormActions from "./FormActions.vue";
import FormErrors from "./FormErrors.vue";
import type { ContactDefaults, FormAction, FormState, Option } from "./types";

const props = withDefaults(
  defineProps<{
    action: FormAction;
    companies: Option[];
    defaults?: ContactDefaults;
    submitLabel?: string;
    cancelHref?: string;
  }>(),
  { defaults: () => ({}), submitLabel: "Save contact", cancelHref: undefined },
);

const values = reactive({
  firstName: "",
  lastName: "",
  title: "",
  companyId: "",
  email: "",
  phone: "",
  linkedinUrl: "",
  decisionRole: "UNKNOWN",
  influenceScore: "0",
  relationshipStatus: "NEW",
  lastInteractionAt: "",
  notes: "",
});

watch(
  () => props.defaults,
  (defaults) => {
    values.firstName = defaults.firstName ?? "";
    values.lastName = defaults.lastName ?? "";
    values.title = defaults.title ?? "";
    values.companyId = defaults.companyId ?? "";
    values.email = defaults.email ?? "";
    values.phone = defaults.phone ?? "";
    values.linkedinUrl = defaults.linkedinUrl ?? "";
    values.decisionRole = defaults.decisionRole ?? "UNKNOWN";
    values.influenceScore = defaults.influenceScore ?? "0";
    values.relationshipStatus = defaults.relationshipStatus ?? "NEW";
    values.lastInteractionAt = defaults.lastInteractionAt ?? "";
    values.notes = defaults.notes ?? "";
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
    <div class="grid gap-3 sm:grid-cols-2">
      <UiField label="First name">
        <UiInput v-model="values.firstName" name="firstName" required />
      </UiField>
      <UiField label="Last name">
        <UiInput v-model="values.lastName" name="lastName" />
      </UiField>
      <UiField label="Title">
        <UiInput v-model="values.title" name="title" />
      </UiField>
      <UiField label="Company">
        <UiSelect v-model="values.companyId" name="companyId">
          <option value="">No company</option>
          <option v-for="c in companies" :key="c.value" :value="c.value">
            {{ c.label }}
          </option>
        </UiSelect>
      </UiField>
      <UiField label="Email">
        <UiInput v-model="values.email" name="email" type="email" />
      </UiField>
      <UiField label="Phone">
        <UiInput v-model="values.phone" name="phone" />
      </UiField>
      <UiField label="Profile URL">
        <UiInput v-model="values.linkedinUrl" name="linkedinUrl" />
      </UiField>
      <UiField label="Decision role">
        <UiSelect v-model="values.decisionRole" name="decisionRole">
          <option v-for="role in DECISION_ROLES" :key="role" :value="role">
            {{ humanise(role) }}
          </option>
        </UiSelect>
      </UiField>
      <UiField label="Influence score" hint="0-100">
        <UiInput
          v-model="values.influenceScore"
          name="influenceScore"
          type="number"
          :min="0"
          :max="100"
        />
      </UiField>
      <UiField label="Relationship status">
        <UiSelect v-model="values.relationshipStatus" name="relationshipStatus">
          <option v-for="status in RELATIONSHIP_STATUSES" :key="status" :value="status">
            {{ humanise(status) }}
          </option>
        </UiSelect>
      </UiField>
      <UiField label="Last interaction">
        <UiInput
          v-model="values.lastInteractionAt"
          name="lastInteractionAt"
          type="date"
        />
      </UiField>
    </div>
    <UiField label="Notes">
      <UiTextarea v-model="values.notes" name="notes" :rows="4" />
    </UiField>
    <FormErrors :state="state" />
    <FormActions :pending="pending" :label="submitLabel" :cancel-href="cancelHref" />
  </form>
</template>
