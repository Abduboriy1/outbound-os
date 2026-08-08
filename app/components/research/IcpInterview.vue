<script setup lang="ts">
/**
 * Port of `src/app/(app)/research/icps/interview.tsx`.
 *
 * Plan §7 — "AI should help construct an ICP by interviewing the user".
 *
 * The draft is never saved. It fills the editor above, which the user then
 * corrects and submits themselves, so an AI guess can never become a stored
 * profile without a human deciding it should.
 *
 * The question list was duplicated in the React component; here it comes from
 * `shared/icps/interview.ts`, which the endpoint reads too (MIGRATION.md §1).
 */
import { ref } from "vue";
import { INTERVIEW_QUESTIONS } from "~~/shared/icps/interview";
import UiBadge from "~/components/ui/UiBadge.vue";
import UiButton from "~/components/ui/UiButton.vue";
import UiCard from "~/components/ui/UiCard.vue";
import UiCardBody from "~/components/ui/UiCardBody.vue";
import UiCardHeader from "~/components/ui/UiCardHeader.vue";
import UiField from "~/components/ui/UiField.vue";
import UiTextarea from "~/components/ui/UiTextarea.vue";
import type { ApiDraft, IcpDraftValues } from "./types";

const emit = defineEmits<{ draft: [draft: IcpDraftValues] }>();

const open = ref(false);
const answers = ref<Record<string, string>>({});
const busy = ref(false);
const error = ref<string | null>(null);
const result = ref<ApiDraft | null>(null);

async function draft() {
  busy.value = true;
  error.value = null;
  try {
    const payload = await $fetch<{ data: { draft: ApiDraft } }>(
      "/api/icps/interview",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: { answers: answers.value },
      },
    );
    const apiDraft = payload.data.draft;
    result.value = apiDraft;
    emit("draft", {
      name: apiDraft.name,
      description: apiDraft.description,
      industries: apiDraft.industries,
      geographies: apiDraft.geographies,
      problems: apiDraft.problems,
      targetRoles: apiDraft.target_roles,
      minEmployees: apiDraft.min_employees,
      maxEmployees: apiDraft.max_employees,
      minDealSize: apiDraft.min_deal_size,
      maxDealSize: apiDraft.max_deal_size,
    });
  } catch (e) {
    const body = (e as { data?: { error?: string } } | null)?.data;
    // A response the endpoint produced carries `error`; anything else never
    // reached it.
    error.value = body
      ? (body.error ?? "Could not draft an ICP")
      : "Could not reach the AI service";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <UiCard>
    <UiCardHeader
      description="Answer what you can. The draft fills the form below for you to edit; nothing is saved until you press Create."
    >
      <template #title>
        <span class="flex items-center gap-2">
          Interview me
          <UiBadge tone="accent">AI assisted</UiBadge>
        </span>
      </template>
      <template #action>
        <UiButton size="sm" type="button" @click="open = !open">
          {{ open ? "Hide" : "Start" }}
        </UiButton>
      </template>
    </UiCardHeader>

    <UiCardBody v-if="open" class="space-y-3">
      <UiField
        v-for="question in INTERVIEW_QUESTIONS"
        :key="question.id"
        :label="question.question"
        :hint="'hint' in question ? question.hint : undefined"
      >
        <UiTextarea
          :rows="2"
          :model-value="answers[question.id] ?? ''"
          @update:model-value="answers = { ...answers, [question.id]: $event ?? '' }"
        />
      </UiField>

      <div class="flex items-center gap-3">
        <UiButton type="button" :disabled="busy" @click="draft">
          {{ busy ? "Drafting" : "Draft an ICP" }}
        </UiButton>
        <span v-if="error" class="text-xs text-danger">{{ error }}</span>
      </div>

      <div
        v-if="result"
        class="space-y-2 rounded-md border border-border bg-surface-muted p-3"
      >
        <p class="text-xs font-medium text-muted">
          AI rationale — review before saving
        </p>
        <p class="text-sm">{{ result.rationale }}</p>
        <div v-if="result.open_questions.length > 0">
          <p class="text-xs font-medium text-muted">
            The draft could not answer these
          </p>
          <ul class="mt-1 list-inside list-disc text-xs text-muted">
            <li v-for="q in result.open_questions" :key="q">{{ q }}</li>
          </ul>
        </div>
        <div v-if="result.disqualifiers.length > 0">
          <p class="text-xs font-medium text-muted">Suggested disqualifiers</p>
          <ul class="mt-1 list-inside list-disc text-xs text-muted">
            <li v-for="d in result.disqualifiers" :key="d">{{ d }}</li>
          </ul>
        </div>
      </div>
    </UiCardBody>
  </UiCard>
</template>
