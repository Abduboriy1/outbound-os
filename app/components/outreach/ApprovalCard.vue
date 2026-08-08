<script setup lang="ts">
/**
 * Port of `src/components/outreach/approval-card.tsx`.
 *
 * One card in the approval queue (plan §16). Nothing here sends on its own:
 * Approve & Send is a form submit that runs the compliance gate server-side,
 * and the button is disabled outright when the pre-flight already failed.
 *
 * The three server actions became `$fetch` calls (see `actions.ts`); the
 * hidden `<input>`s that carried FormData are gone because the values are
 * `v-model`-bound instead.
 */
import { computed, ref } from "vue";
import type { LeadStage } from "~~/server/generated/prisma/client";
import UiBadge from "~/components/ui/UiBadge.vue";
import UiButton from "~/components/ui/UiButton.vue";
import UiCard from "~/components/ui/UiCard.vue";
import UiCardBody from "~/components/ui/UiCardBody.vue";
import UiCardHeader from "~/components/ui/UiCardHeader.vue";
import UiInput from "~/components/ui/UiInput.vue";
import UiSelect from "~/components/ui/UiSelect.vue";
import UiTextarea from "~/components/ui/UiTextarea.vue";
import ActionForm from "./ActionForm.vue";
import SubmitButton from "./SubmitButton.vue";
import {
  HINT_LABELS,
  REGENERATION_HINTS,
  STAGE_LABELS,
  STAGE_TONES,
  VARIANT_LABELS,
} from "./constants";
import type { OutreachVariant, RegenerationHint } from "./constants";
import {
  approveAndSendAction,
  regenerateDraftAction,
  rejectDraftAction,
} from "./actions";
import type { ActionState } from "./actions";
import type { ApprovalDraft } from "./types";

type Mode = "PREVIEW" | "EDIT";

const props = defineProps<{
  draft: ApprovalDraft;
  /** The compliance footer that will be appended on send. */
  footerPreview: string | null;
}>();

const emit = defineEmits<{ result: [state: ActionState] }>();

const mode = ref<Mode>("PREVIEW");
const subject = ref(props.draft.subject ?? "");
const body = ref(props.draft.body);
const rejecting = ref(false);
const rejectReason = ref("");
const hint = ref<RegenerationHint>("SHORTER");

const blocked = computed(
  () => props.draft.blocks.length > 0 || props.draft.placeholders.length > 0,
);

const variantLabel = computed(
  () =>
    VARIANT_LABELS[props.draft.variant as OutreachVariant] ?? props.draft.variant,
);

const approveLabel = computed(() =>
  props.draft.channel === "EMAIL" ? "Approve & Send" : "Approve for manual send",
);

/** The source builds this inline; a computed keeps the spacing exact. */
const contactLine = computed(() => {
  const draft = props.draft;
  if (!draft.contactName) return "";
  return [
    draft.reason ? " · " : "",
    draft.contactName,
    draft.contactTitle ? `, ${draft.contactTitle}` : "",
    draft.contactEmail ? ` <${draft.contactEmail}>` : "",
  ].join("");
});

function approve() {
  return approveAndSendAction({
    draftId: props.draft.id,
    channel: props.draft.channel,
    subject: subject.value,
    body: body.value,
  });
}

function regenerate() {
  return regenerateDraftAction({
    draftId: props.draft.id,
    hint: hint.value,
    leadId: props.draft.leadId,
    variant: props.draft.variant,
    reason: props.draft.reason,
  });
}

function reject() {
  return rejectDraftAction({
    draftId: props.draft.id,
    reason: rejectReason.value,
  });
}
</script>

<template>
  <UiCard>
    <UiCardHeader>
      <template #title>
        <span class="flex flex-wrap items-center gap-2">
          {{ draft.companyName }}
          <UiBadge :tone="STAGE_TONES[draft.stage as LeadStage] ?? 'neutral'">
            {{ STAGE_LABELS[draft.stage as LeadStage] ?? draft.stage }}
          </UiBadge>
          <UiBadge v-if="draft.score != null" tone="accent">
            Score {{ draft.score }}
          </UiBadge>
          <UiBadge>{{ variantLabel }}</UiBadge>
          <UiBadge v-if="draft.channel !== 'EMAIL'" tone="warning">
            {{ draft.channel }}
          </UiBadge>
          <UiBadge v-if="draft.regenerationHint" tone="neutral">
            Regenerated:
            {{
              HINT_LABELS[draft.regenerationHint as keyof typeof HINT_LABELS] ??
              draft.regenerationHint
            }}
          </UiBadge>
        </span>
      </template>

      <template #description>
        <span v-if="draft.reason">Reason: {{ draft.reason }}</span>
        <span v-if="draft.contactName">{{ contactLine }}</span>
      </template>

      <template #action>
        <div class="flex gap-1">
          <UiButton
            size="sm"
            :variant="mode === 'PREVIEW' ? 'primary' : 'ghost'"
            @click="mode = 'PREVIEW'"
          >
            Preview
          </UiButton>
          <UiButton
            size="sm"
            :variant="mode === 'EDIT' ? 'primary' : 'ghost'"
            @click="mode = 'EDIT'"
          >
            Edit
          </UiButton>
        </div>
      </template>
    </UiCardHeader>

    <UiCardBody class="space-y-3">
      <div
        v-if="draft.blocks.length > 0"
        class="rounded-md border border-border bg-danger-soft p-3"
      >
        <p class="text-xs font-medium text-danger">Compliance blocks this send</p>
        <ul class="mt-1 space-y-0.5 text-xs text-danger">
          <li v-for="block in draft.blocks" :key="block.code">
            {{ block.message }}
          </li>
        </ul>
      </div>

      <div
        v-if="draft.placeholders.length > 0"
        class="rounded-md border border-border bg-warning-soft p-3 text-xs text-warning"
      >
        Unfilled placeholders: {{ draft.placeholders.join(", ") }}. Edit the
        message before approving.
      </div>

      <ActionForm
        :action="approve"
        class="space-y-3"
        @result="emit('result', $event)"
      >
        <div v-if="mode === 'EDIT'" class="space-y-2">
          <UiInput
            v-if="draft.channel === 'EMAIL'"
            v-model="subject"
            name="subject"
            placeholder="Subject"
            aria-label="Subject"
          />
          <UiTextarea
            v-model="body"
            name="body"
            :rows="14"
            aria-label="Message body"
            class="font-mono text-xs"
          />
        </div>
        <div v-else class="space-y-2">
          <p v-if="draft.channel === 'EMAIL' && subject" class="text-sm font-medium">
            {{ subject }}
          </p>
          <pre
            class="rounded-md border border-border bg-surface-muted p-3 text-xs whitespace-pre-wrap"
            >{{ body }}</pre
          >
          <details v-if="footerPreview" class="text-xs text-muted">
            <summary class="cursor-pointer">
              Compliance footer appended on send
            </summary>
            <pre class="mt-1 whitespace-pre-wrap">{{ footerPreview }}</pre>
          </details>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <SubmitButton
            variant="primary"
            :disabled="blocked"
            :title="blocked ? 'Resolve the blocks above before sending' : undefined"
          >
            {{ approveLabel }}
          </SubmitButton>
          <UiButton
            size="sm"
            variant="ghost"
            type="button"
            @click="rejecting = !rejecting"
          >
            Reject
          </UiButton>
        </div>
      </ActionForm>

      <div class="flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <ActionForm
          :action="regenerate"
          class="flex items-end gap-2"
          @result="emit('result', $event)"
        >
          <label class="text-xs text-muted">
            Regenerate
            <UiSelect v-model="hint" name="hint" class="mt-1 w-52">
              <option v-for="option in REGENERATION_HINTS" :key="option" :value="option">
                {{ HINT_LABELS[option] }}
              </option>
            </UiSelect>
          </label>
          <SubmitButton>Regenerate</SubmitButton>
        </ActionForm>
      </div>

      <ActionForm
        v-if="rejecting"
        :action="reject"
        class="flex items-end gap-2 border-t border-border pt-3"
        @result="emit('result', $event)"
      >
        <label class="flex-1 text-xs text-muted">
          Why is this wrong?
          <UiInput
            v-model="rejectReason"
            name="reason"
            class="mt-1"
            placeholder="Wrong contact, weak observation, tone is off..."
          />
        </label>
        <SubmitButton variant="danger">Reject</SubmitButton>
      </ActionForm>

      <details
        v-if="draft.regeneratedFrom"
        class="border-t border-border pt-3 text-xs text-muted"
      >
        <summary class="cursor-pointer">Previous draft</summary>
        <pre class="mt-1 whitespace-pre-wrap">{{ draft.regeneratedFrom.body }}</pre>
      </details>
    </UiCardBody>
  </UiCard>
</template>
