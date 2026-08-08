<script setup lang="ts">
/** Port of `LeadForm` from `src/components/leads/forms.tsx`. */
import { ref, watch } from "vue";
import FormActions from "./FormActions.vue";
import FormErrors from "./FormErrors.vue";
import LeadFields from "./LeadFields.vue";
import type {
  FormAction,
  FormState,
  LeadDefaults,
  LeadFieldValues,
  Option,
} from "./types";
import type { LeadStage } from "~~/server/generated/prisma/client";

const props = withDefaults(
  defineProps<{
    action: FormAction;
    companies: Option[];
    contacts: Option[];
    icps: Option[];
    stages: LeadStage[];
    defaults?: LeadDefaults;
    submitLabel?: string;
    cancelHref?: string;
    showStage?: boolean;
  }>(),
  {
    defaults: () => ({}),
    submitLabel: "Save lead",
    cancelHref: undefined,
    showStage: true,
  },
);

const values = ref<LeadFieldValues>({
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

watch(
  () => props.defaults,
  (defaults) => {
    values.value.companyId = defaults.companyId ?? "";
    values.value.contactId = defaults.contactId ?? "";
    values.value.stage = defaults.stage ?? "PROSPECT";
    values.value.icpId = defaults.icpId ?? "";
    values.value.sourceType = defaults.sourceType ?? "MANUAL";
    values.value.sourceDetail = defaults.sourceDetail ?? "";
    values.value.estimatedValueMin = defaults.estimatedValueMin ?? "";
    values.value.estimatedValueMax = defaults.estimatedValueMax ?? "";
    values.value.nextAction = defaults.nextAction ?? "";
    values.value.nextActionDueAt = defaults.nextActionDueAt ?? "";
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
      ...values.value,
    });
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <form class="space-y-3" @submit.prevent="onSubmit">
    <input v-if="defaults.id" type="hidden" name="id" :value="defaults.id">
    <LeadFields
      v-model="values"
      :companies="companies"
      :contacts="contacts"
      :icps="icps"
      :stages="stages"
      :show-stage="showStage"
    />
    <FormErrors :state="state" />
    <FormActions :pending="pending" :label="submitLabel" :cancel-href="cancelHref" />
  </form>
</template>
