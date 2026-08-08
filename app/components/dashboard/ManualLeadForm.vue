<script setup lang="ts">
/**
 * Port of `ManualLeadForm` from `src/app/(app)/import/manual-form.tsx`.
 * Plan §8 — manual entry, the simplest lead source.
 *
 * `createManualLeadAction` runs client-side now (see `importer.ts`), against
 * the same `manualLeadSchema`, the same `toDiscoveredLead` normalisation and
 * the same `dedupeLeads` check the server action used.
 */
import {
  dedupeLeads,
  manualLeadSchema,
  toDiscoveredLead,
} from "~~/shared/leadsources";
import { createFromDiscovered, existingKeys } from "./importer";
import { errorMessage } from "./api";

const emit = defineEmits<{ created: [] }>();

const form = reactive({
  companyName: "",
  website: "",
  industry: "",
  location: "",
  employeeCount: "",
  contactFirstName: "",
  contactLastName: "",
  contactTitle: "",
  contactEmail: "",
  description: "",
  sourceDetail: "",
});

const pending = ref(false);
const error = ref<string | undefined>();
const created = ref<string | undefined>();

async function submit() {
  pending.value = true;
  error.value = undefined;
  created.value = undefined;

  const parsed = manualLeadSchema.safeParse({
    ...form,
    employeeCount: form.employeeCount === "" ? undefined : form.employeeCount,
  });
  if (!parsed.success) {
    error.value = parsed.error.issues[0]?.message ?? "Invalid lead";
    pending.value = false;
    return;
  }

  try {
    const lead = toDiscoveredLead(parsed.data);
    const { unique, duplicates } = dedupeLeads([lead], await existingKeys());

    if (unique.length === 0) {
      error.value = `Already in the pipeline (${duplicates[0]!.matched}). Open it from Leads instead of creating a second record.`;
      return;
    }

    await createFromDiscovered(lead, "MANUAL");
    created.value = lead.companyName;
    Object.assign(form, {
      companyName: "",
      website: "",
      industry: "",
      location: "",
      employeeCount: "",
      contactFirstName: "",
      contactLastName: "",
      contactTitle: "",
      contactEmail: "",
      description: "",
      sourceDetail: "",
    });
    emit("created");
  } catch (e) {
    error.value = errorMessage(e, "Could not add the lead");
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <UiCard>
    <UiCardHeader
      title="Add one lead"
      description="Only the company name is required. Anything else you know now saves research later."
    />
    <UiCardBody>
      <form class="grid gap-3 sm:grid-cols-2" @submit.prevent="submit">
        <div class="sm:col-span-2">
          <UiField label="Company name" :error="error">
            <UiInput
              v-model="form.companyName"
              name="companyName"
              required
              placeholder="Acme Logistics"
            />
          </UiField>
        </div>
        <UiField label="Website or domain">
          <UiInput v-model="form.website" name="website" placeholder="https://acme.com" />
        </UiField>
        <UiField label="Industry">
          <UiInput v-model="form.industry" name="industry" placeholder="Logistics" />
        </UiField>
        <UiField label="Location">
          <UiInput v-model="form.location" name="location" placeholder="Chicago, IL" />
        </UiField>
        <UiField label="Employees">
          <UiInput
            v-model="form.employeeCount"
            name="employeeCount"
            type="number"
            min="1"
            placeholder="120"
          />
        </UiField>

        <UiField label="Contact first name">
          <UiInput v-model="form.contactFirstName" name="contactFirstName" placeholder="Jo" />
        </UiField>
        <UiField label="Contact last name">
          <UiInput v-model="form.contactLastName" name="contactLastName" placeholder="Rivera" />
        </UiField>
        <UiField label="Contact title">
          <UiInput v-model="form.contactTitle" name="contactTitle" placeholder="COO" />
        </UiField>
        <UiField label="Contact email">
          <UiInput
            v-model="form.contactEmail"
            name="contactEmail"
            type="email"
            placeholder="jo@acme.com"
          />
        </UiField>

        <div class="sm:col-span-2">
          <UiField label="Notes" hint="Where you found them, why they might be a fit.">
            <UiTextarea v-model="form.description" name="description" rows="2" />
          </UiField>
        </div>
        <div class="sm:col-span-2">
          <UiField label="Source detail">
            <UiInput
              v-model="form.sourceDetail"
              name="sourceDetail"
              placeholder="Conference list, referral, directory"
            />
          </UiField>
        </div>

        <div class="flex items-center gap-3 sm:col-span-2">
          <UiButton type="submit" variant="primary" :disabled="pending">
            {{ pending ? "Adding" : "Add lead" }}
          </UiButton>
          <span v-if="created" class="text-xs text-positive">
            Added {{ created }}. It is queued for research.
          </span>
        </div>
      </form>
    </UiCardBody>
  </UiCard>
</template>
