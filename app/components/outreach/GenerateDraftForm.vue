<script setup lang="ts">
/** Port of `GenerateDraftForm` from `src/components/outreach/simple-forms.tsx`. */
import { ref } from "vue";
import UiSelect from "~/components/ui/UiSelect.vue";
import ActionForm from "./ActionForm.vue";
import SubmitButton from "./SubmitButton.vue";
import { OUTREACH_VARIANTS, VARIANT_LABELS } from "./constants";
import type { OutreachVariant } from "./constants";
import { generateDraftAction } from "./actions";
import type { ActionState } from "./actions";

const props = defineProps<{
  leadId: string;
  reason?: string | null;
}>();

const emit = defineEmits<{ result: [state: ActionState] }>();

const variant = ref<OutreachVariant>("EMAIL");

function submit() {
  return generateDraftAction({
    leadId: props.leadId,
    variant: variant.value,
    reason: props.reason ?? "",
  });
}
</script>

<template>
  <ActionForm
    :action="submit"
    class="flex items-end gap-2"
    @result="emit('result', $event)"
  >
    <UiSelect v-model="variant" name="variant" class="w-44">
      <option v-for="option in OUTREACH_VARIANTS" :key="option" :value="option">
        {{ VARIANT_LABELS[option] }}
      </option>
    </UiSelect>
    <SubmitButton>Draft</SubmitButton>
  </ActionForm>
</template>
