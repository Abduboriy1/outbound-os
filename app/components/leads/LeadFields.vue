<script setup lang="ts">
/**
 * Port of the private `LeadFields` component in `src/components/leads/forms.tsx`.
 *
 * React read these fields back out of the DOM through `FormData`, so the group
 * owned nothing. Here the owning form passes its reactive `values` object in
 * and this component binds straight into it, which keeps `LeadForm` and
 * `QuickLeadForm` sharing one definition of the field set exactly as before.
 */
import { LEAD_SOURCE_TYPES, STAGE_LABELS, humanise } from "./constants";
import type { LeadFieldValues, Option } from "./types";
import type { LeadStage } from "~~/server/generated/prisma/client";

withDefaults(
  defineProps<{
    companies?: Option[];
    contacts?: Option[];
    icps: Option[];
    stages: LeadStage[];
    showStage?: boolean;
  }>(),
  { companies: undefined, contacts: undefined, showStage: true },
);

/**
 * The owning form's value object, bound with `v-model`. It is mutated in place
 * rather than emitted back field by field, which is the closest equivalent of
 * React reading the whole group back out of the DOM through `FormData`.
 */
const values = defineModel<LeadFieldValues>({ required: true });
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-2">
    <UiField v-if="companies" label="Company">
      <UiSelect v-model="values.companyId" name="companyId" required>
        <option value="">Select a company</option>
        <option v-for="c in companies" :key="c.value" :value="c.value">
          {{ c.label }}
        </option>
      </UiSelect>
    </UiField>
    <UiField v-if="contacts" label="Primary contact">
      <UiSelect v-model="values.contactId" name="contactId">
        <option value="">No contact yet</option>
        <option v-for="c in contacts" :key="c.value" :value="c.value">
          {{ c.label }}
        </option>
      </UiSelect>
    </UiField>
    <UiField v-if="showStage" label="Stage">
      <UiSelect v-model="values.stage" name="stage">
        <option v-for="s in stages" :key="s" :value="s">{{ STAGE_LABELS[s] }}</option>
      </UiSelect>
    </UiField>
    <UiField label="ICP">
      <UiSelect v-model="values.icpId" name="icpId">
        <option value="">Not assigned</option>
        <option v-for="i in icps" :key="i.value" :value="i.value">{{ i.label }}</option>
      </UiSelect>
    </UiField>
    <UiField label="Source">
      <UiSelect v-model="values.sourceType" name="sourceType">
        <option v-for="s in LEAD_SOURCE_TYPES" :key="s" :value="s">
          {{ humanise(s) }}
        </option>
      </UiSelect>
    </UiField>
    <UiField label="Source detail">
      <UiInput v-model="values.sourceDetail" name="sourceDetail" />
    </UiField>
    <UiField label="Estimated value min">
      <UiInput
        v-model="values.estimatedValueMin"
        name="estimatedValueMin"
        type="number"
        :min="0"
      />
    </UiField>
    <UiField label="Estimated value max">
      <UiInput
        v-model="values.estimatedValueMax"
        name="estimatedValueMax"
        type="number"
        :min="0"
      />
    </UiField>
    <UiField label="Next action">
      <UiInput v-model="values.nextAction" name="nextAction" />
    </UiField>
    <UiField label="Next action due">
      <UiInput
        v-model="values.nextActionDueAt"
        name="nextActionDueAt"
        type="date"
      />
    </UiField>
  </div>
</template>
