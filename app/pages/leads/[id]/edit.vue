<script setup lang="ts">
/** Port of `src/app/(app)/leads/[id]/edit/page.tsx`. */
import { computed } from "vue";
import LeadForm from "~/components/leads/LeadForm.vue";
import { saveLeadAction } from "~/components/leads/actions";
import { ALL_STAGES } from "~/components/leads/constants";
import { toDateInputValue } from "~/components/leads/display";
import { useLeadFormOptions } from "~/components/leads/useOptions";
import { useLeadWorkspace } from "~/components/leads/useLeadWorkspace";

const workspace = useLeadWorkspace();
const lead = computed(() => workspace.value.lead);

const { companyChoices, contactChoices, icpChoices } = await useLeadFormOptions();

const defaults = computed(() => ({
  id: lead.value.id,
  companyId: lead.value.companyId,
  contactId: lead.value.contactId ?? "",
  icpId: lead.value.icpId ?? "",
  stage: lead.value.stage,
  sourceType: lead.value.sourceType,
  sourceDetail: lead.value.sourceDetail ?? "",
  estimatedValueMin:
    lead.value.estimatedValueMin == null ? "" : String(lead.value.estimatedValueMin),
  estimatedValueMax:
    lead.value.estimatedValueMax == null ? "" : String(lead.value.estimatedValueMax),
  nextAction: lead.value.nextAction ?? "",
  nextActionDueAt: toDateInputValue(lead.value.nextActionDueAt),
}));
</script>

<template>
  <UiCard class="max-w-3xl">
    <UiCardHeader
      title="Edit lead"
      description="Stage changes are recorded separately, from the header above."
    />
    <UiCardBody>
      <LeadForm
        :action="saveLeadAction"
        :show-stage="false"
        :companies="companyChoices"
        :contacts="contactChoices"
        :icps="icpChoices"
        :stages="ALL_STAGES"
        :cancel-href="`/leads/${lead.id}`"
        :defaults="defaults"
      />
    </UiCardBody>
  </UiCard>
</template>
