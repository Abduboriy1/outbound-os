<script setup lang="ts">
/**
 * Port of `src/app/(app)/research/icps/icp-editor.tsx`.
 *
 * `useActionState(createIcpAction | updateIcpAction)` becomes a submit handler
 * plus local `pending` / `state` refs. The rule inputs were uncontrolled in
 * React and read back out of FormData by name; there is no FormData here, so
 * they are `v-model`-bound like everything else.
 */
import { computed, ref, toRaw } from "vue";
import UiButton from "~/components/ui/UiButton.vue";
import UiCard from "~/components/ui/UiCard.vue";
import UiCardBody from "~/components/ui/UiCardBody.vue";
import UiCardHeader from "~/components/ui/UiCardHeader.vue";
import UiField from "~/components/ui/UiField.vue";
import UiInput from "~/components/ui/UiInput.vue";
import UiSelect from "~/components/ui/UiSelect.vue";
import UiTextarea from "~/components/ui/UiTextarea.vue";
import IcpInterview from "./IcpInterview.vue";
import IcpListField from "./IcpListField.vue";
import IcpWeightRow from "./IcpWeightRow.vue";
import { createIcpAction, updateIcpAction } from "./actions";
import type { IcpFormState } from "./actions";
import { RULE_OPERATORS, numberOrNull } from "./icp";
import {
  FIT_FACTORS,
  FIT_FACTOR_LABELS,
  OPPORTUNITY_FACTORS,
  OPPORTUNITY_FACTOR_LABELS,
} from "~~/shared/scoring/weights";
import type { FitFactorKey, OpportunityFactorKey } from "~~/shared/scoring/weights";
import type { IcpDraftValues, IcpEditorValues, IcpRule } from "./types";

const props = defineProps<{
  initial: IcpEditorValues;
  mode: "create" | "edit";
}>();

// Held in state so an AI draft can prefill the form without a round trip.
const values = ref<IcpEditorValues>(structuredClone(toRaw(props.initial)));
const rules = ref<IcpRule[]>(structuredClone(toRaw(props.initial.rules)));

const state = ref<IcpFormState>({});
const pending = ref(false);

function applyDraft(draft: IcpDraftValues) {
  values.value = {
    ...values.value,
    name: draft.name || values.value.name,
    description: draft.description || values.value.description,
    industries: draft.industries,
    geographies: draft.geographies,
    problems: draft.problems,
    targetRoles: draft.targetRoles,
    minEmployees: draft.minEmployees,
    maxEmployees: draft.maxEmployees,
    minDealSize: draft.minDealSize,
    maxDealSize: draft.maxDealSize,
  };
}

const blendFit = computed(() => Math.round(values.value.weights.blend.fit * 100));

function setBlend(percentage: number) {
  values.value = {
    ...values.value,
    weights: {
      ...values.value.weights,
      blend: { fit: percentage / 100, opportunity: 1 - percentage / 100 },
    },
  };
}

function setFit(key: FitFactorKey, value: number) {
  values.value.weights.fit[key] = value;
}

function setOpportunity(key: OpportunityFactorKey, value: number) {
  values.value.weights.opportunity[key] = value;
}

function addRule() {
  rules.value = [
    ...rules.value,
    { field: "", operator: "equals", value: "", weight: 10 },
  ];
}

function removeRule(index: number) {
  rules.value = rules.value.filter((_, i) => i !== index);
}

async function submit() {
  if (pending.value) return;
  pending.value = true;
  state.value = {};
  try {
    const payload: IcpEditorValues = { ...values.value, rules: rules.value };
    if (props.mode === "create") {
      const result = await createIcpAction(payload);
      if (result.error) {
        state.value = { error: result.error };
        return;
      }
      await navigateTo(`/research/icps/${result.id}`);
      return;
    }
    state.value = await updateIcpAction(values.value.id ?? "", payload);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <IcpInterview v-if="mode === 'create'" @draft="applyDraft" />

    <form class="space-y-4" @submit.prevent="submit">
      <UiCard>
        <UiCardHeader title="Profile" description="Who you are trying to reach." />
        <UiCardBody class="grid gap-3 sm:grid-cols-2">
          <UiField label="Name">
            <UiInput
              v-model="values.name"
              name="name"
              required
              placeholder="Logistics Automation ICP"
            />
          </UiField>
          <UiField
            label="Default profile"
            hint="Used when a lead has no ICP assigned."
          >
            <label class="flex h-9 items-center gap-2 text-sm">
              <input v-model="values.isDefault" type="checkbox" name="isDefault">
              Make this the default
            </label>
          </UiField>
          <div class="sm:col-span-2">
            <UiField label="Description">
              <UiTextarea v-model="values.description" name="description" :rows="2" />
            </UiField>
          </div>
        </UiCardBody>
      </UiCard>

      <UiCard>
        <UiCardHeader
          title="Targeting"
          description="One per line, or comma separated."
        />
        <UiCardBody class="grid gap-3 sm:grid-cols-2">
          <IcpListField
            label="Industries"
            name="industries"
            :values="values.industries"
            :placeholder="'Logistics\nTrucking\nTransportation'"
            @update:values="values.industries = $event"
          />
          <IcpListField
            label="Geographies"
            name="geographies"
            :values="values.geographies"
            :placeholder="'United States\nCanada'"
            @update:values="values.geographies = $event"
          />
          <IcpListField
            label="Problems"
            name="problems"
            :values="values.problems"
            :placeholder="'Spreadsheet operations\nManual reporting\nDuplicate data entry'"
            @update:values="values.problems = $event"
          />
          <IcpListField
            label="Target roles"
            name="targetRoles"
            :values="values.targetRoles"
            :placeholder="'Owner\nCOO\nVP Operations'"
            @update:values="values.targetRoles = $event"
          />

          <UiField label="Employees (min)">
            <UiInput
              name="minEmployees"
              type="number"
              min="0"
              :model-value="values.minEmployees == null ? '' : String(values.minEmployees)"
              @update:model-value="values.minEmployees = numberOrNull($event ?? '')"
            />
          </UiField>
          <UiField label="Employees (max)">
            <UiInput
              name="maxEmployees"
              type="number"
              min="0"
              :model-value="values.maxEmployees == null ? '' : String(values.maxEmployees)"
              @update:model-value="values.maxEmployees = numberOrNull($event ?? '')"
            />
          </UiField>
          <UiField label="Deal size (min)">
            <UiInput
              name="minDealSize"
              type="number"
              min="0"
              :model-value="values.minDealSize == null ? '' : String(values.minDealSize)"
              @update:model-value="values.minDealSize = numberOrNull($event ?? '')"
            />
          </UiField>
          <UiField label="Deal size (max)">
            <UiInput
              name="maxDealSize"
              type="number"
              min="0"
              :model-value="values.maxDealSize == null ? '' : String(values.maxDealSize)"
              @update:model-value="values.maxDealSize = numberOrNull($event ?? '')"
            />
          </UiField>
        </UiCardBody>
      </UiCard>

      <UiCard>
        <UiCardHeader
          title="Scoring weights"
          description="Plan §12 — retune how much each factor counts. Weights are relative; they do not need to sum to 100."
        />
        <UiCardBody class="grid gap-4 md:grid-cols-2">
          <div>
            <p class="mb-2 text-xs font-medium text-muted">Fit factors</p>
            <div class="space-y-2">
              <IcpWeightRow
                v-for="key in FIT_FACTORS"
                :key="key"
                :name="`fit.${key}`"
                :label="FIT_FACTOR_LABELS[key]"
                :value="values.weights.fit[key]"
                @update:value="setFit(key, $event)"
              />
            </div>
          </div>
          <div>
            <p class="mb-2 text-xs font-medium text-muted">Opportunity factors</p>
            <div class="space-y-2">
              <IcpWeightRow
                v-for="key in OPPORTUNITY_FACTORS"
                :key="key"
                :name="`opportunity.${key}`"
                :label="OPPORTUNITY_FACTOR_LABELS[key]"
                :value="values.weights.opportunity[key]"
                @update:value="setOpportunity(key, $event)"
              />
            </div>
          </div>
          <div class="md:col-span-2">
            <UiField
              :label="`Overall blend — fit ${blendFit}% / opportunity ${100 - blendFit}%`"
              hint="How the two scores combine into the overall number."
            >
              <input
                name="blend.fit"
                type="range"
                min="0"
                max="100"
                step="5"
                :value="blendFit"
                class="w-full"
                @input="setBlend(Number(($event.target as HTMLInputElement).value))"
              >
            </UiField>
          </div>
        </UiCardBody>
      </UiCard>

      <UiCard>
        <UiCardHeader
          title="Rules"
          description="Optional hard checks applied on top of the weighted score."
        >
          <template #action>
            <UiButton size="sm" type="button" @click="addRule">Add rule</UiButton>
          </template>
        </UiCardHeader>
        <UiCardBody class="space-y-2">
          <p v-if="rules.length === 0" class="text-xs text-muted">
            No rules. The weighted score decides.
          </p>
          <div
            v-for="(rule, index) in rules"
            :key="index"
            class="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_5rem_auto] sm:items-end"
          >
            <UiField label="Field">
              <UiInput v-model="rule.field" name="rule.field" placeholder="industry" />
            </UiField>
            <UiField label="Operator">
              <UiSelect v-model="rule.operator" name="rule.operator">
                <option v-for="op in RULE_OPERATORS" :key="op" :value="op">
                  {{ op }}
                </option>
              </UiSelect>
            </UiField>
            <UiField label="Value">
              <UiInput v-model="rule.value" name="rule.value" />
            </UiField>
            <UiField label="Weight">
              <UiInput
                name="rule.weight"
                type="number"
                min="0"
                max="100"
                :model-value="String(rule.weight)"
                @update:model-value="rule.weight = Number($event ?? 0)"
              />
            </UiField>
            <UiButton type="button" size="sm" variant="ghost" @click="removeRule(index)">
              Remove
            </UiButton>
          </div>
        </UiCardBody>
      </UiCard>

      <div class="flex items-center gap-3">
        <UiButton type="submit" variant="primary" :disabled="pending">
          {{ pending ? "Saving" : mode === "create" ? "Create ICP" : "Save changes" }}
        </UiButton>
        <span v-if="state.error" class="text-xs text-danger">{{ state.error }}</span>
      </div>
    </form>
  </div>
</template>
