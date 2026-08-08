<script setup lang="ts">
/**
 * Port of `RoiCalculator` from `src/app/(app)/opportunities/roi-calculator.tsx`.
 *
 * Plan §25. The arithmetic runs live in the browser from the same pure function
 * the server uses, so the preview and the stored estimate can never diverge.
 *
 * The provenance marker is not decoration: the plan is explicit that an AI or
 * internal estimate must never be presented as a confirmed number, so an
 * unconfirmed estimate is labelled as one everywhere it is shown.
 *
 * GAP: `saveRoiAction` upserted `RoiEstimate` through Prisma and MIGRATION.md
 * §4 has no opportunities endpoint, so saving posts to
 * `PUT /api/opportunities/:id/roi`, the route such an endpoint would occupy.
 * The calculator itself — every figure below the form — is fully live.
 */
import { formatCurrency } from "~/utils/format";
import { computeRoi } from "~~/shared/analytics/roi";
import { errorMessage } from "./api";

export type RoiInitial = {
  employees: number;
  hoursPerWeek: number;
  hourlyCost: number;
  projectCost: number | null;
  prospectSupplied: boolean;
  saved: boolean;
};

const props = defineProps<{
  opportunityId: string;
  initial: RoiInitial;
}>();

const values = ref<RoiInitial>({ ...props.initial });
const pending = ref(false);
const error = ref<string | null>(null);
const saved = ref(false);

/** `<Input type="number">` gives back a string; the source coerced it the same way. */
const employees = computed({
  get: () => String(values.value.employees),
  set: (v: string) => {
    values.value.employees = numberOr(v, 0);
  },
});
const hoursPerWeek = computed({
  get: () => String(values.value.hoursPerWeek),
  set: (v: string) => {
    values.value.hoursPerWeek = numberOr(v, 0);
  },
});
const hourlyCost = computed({
  get: () => String(values.value.hourlyCost),
  set: (v: string) => {
    values.value.hourlyCost = numberOr(v, 0);
  },
});
const projectCost = computed({
  get: () => (values.value.projectCost == null ? "" : String(values.value.projectCost)),
  set: (v: string) => {
    values.value.projectCost = v === "" ? null : numberOr(v, 0);
  },
});

const result = computed(() =>
  computeRoi({
    employees: values.value.employees,
    hoursPerWeek: values.value.hoursPerWeek,
    hourlyCost: values.value.hourlyCost,
    projectCost: values.value.projectCost,
    prospectSupplied: values.value.prospectSupplied,
  }),
);

async function submit() {
  pending.value = true;
  error.value = null;
  saved.value = false;
  try {
    await $fetch(`/api/opportunities/${props.opportunityId}/roi`, {
      method: "PUT",
      body: {
        opportunityId: props.opportunityId,
        employees: values.value.employees,
        hoursPerWeek: values.value.hoursPerWeek,
        hourlyCost: values.value.hourlyCost,
        projectCost: values.value.projectCost,
        prospectSupplied: values.value.prospectSupplied,
      },
    });
    saved.value = true;
  } catch (e) {
    error.value = errorMessage(e, "Invalid figures");
  } finally {
    pending.value = false;
  }
}

function numberOr(value: string, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
</script>

<template>
  <UiCard>
    <UiCardHeader
      title="ROI calculator"
      description="What the current manual process costs, against what replacing it would cost."
    >
      <template #action>
        <UiBadge :tone="values.prospectSupplied ? 'positive' : 'warning'">
          {{ values.prospectSupplied ? "Prospect-supplied" : "Our estimate" }}
        </UiBadge>
      </template>
    </UiCardHeader>
    <UiCardBody class="space-y-4">
      <form class="space-y-4" @submit.prevent="submit">
        <div class="grid gap-3 sm:grid-cols-4">
          <UiField label="People involved">
            <UiInput v-model="employees" name="employees" type="number" min="0" step="1" />
          </UiField>
          <UiField label="Hours per week (each)">
            <UiInput
              v-model="hoursPerWeek"
              name="hoursPerWeek"
              type="number"
              min="0"
              max="168"
              step="0.5"
            />
          </UiField>
          <UiField label="Loaded hourly cost" hint="Salary plus overhead.">
            <UiInput v-model="hourlyCost" name="hourlyCost" type="number" min="0" step="1" />
          </UiField>
          <UiField label="Project cost" hint="Leave empty until quoted.">
            <UiInput
              v-model="projectCost"
              name="projectCost"
              type="number"
              min="0"
              step="100"
            />
          </UiField>
        </div>

        <label class="flex items-center gap-2 text-sm">
          <input
            v-model="values.prospectSupplied"
            type="checkbox"
            name="prospectSupplied"
          >
          These figures came from the prospect, not from us
        </label>

        <div class="flex items-center gap-3">
          <UiButton type="submit" variant="primary" :disabled="pending">
            {{ pending ? "Saving" : "Save figures" }}
          </UiButton>
          <span v-if="error" class="text-xs text-danger">{{ error }}</span>
          <span v-if="saved" class="text-xs text-positive">Saved.</span>
        </div>
      </form>

      <div class="grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardRoiFigure
          label="Weekly cost"
          :value="formatCurrency(result.weeklyCost)"
        />
        <DashboardRoiFigure
          label="Annual cost"
          :value="formatCurrency(result.annualCost)"
          :sub="`${result.annualHours} hours a year`"
        />
        <DashboardRoiFigure
          label="Payback"
          :value="result.paybackMonths == null ? '—' : `${result.paybackMonths} months`"
          :sub="result.projectCost == null ? 'Needs a project cost' : undefined"
        />
        <DashboardRoiFigure
          label="3-year value"
          :value="formatCurrency(result.threeYearValue)"
          :sub="
            result.threeYearNet == null
              ? undefined
              : `${formatCurrency(result.threeYearNet)} net of project cost`
          "
        />
      </div>

      <p class="text-xs text-muted">
        {{
          values.prospectSupplied
            ? "Based on figures the prospect gave. Repeat them back before using them in a proposal."
            : "These are our estimates, not confirmed numbers. Ask the prospect for their own figures on the discovery call before putting any of this in writing."
        }}
        Savings assume the workflow is fully removed; scope anything partial down before
        quoting.
      </p>
    </UiCardBody>
  </UiCard>
</template>
