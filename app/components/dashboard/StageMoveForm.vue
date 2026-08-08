<script setup lang="ts">
/**
 * Port of `StageMoveForm` from `src/components/leads/workspace.tsx`.
 *
 * Stage changes are a select plus an explicit submit rather than drag and drop,
 * so the board works with a keyboard and a screen reader.
 *
 * The React version took a server action; here the submit posts to
 * `POST /api/leads/:id/stage` (MIGRATION.md §4), which runs the same
 * `changeLeadStage` service the action did — same do-not-contact rule, same
 * history rows, same error strings. `useActionState`'s `[state, pending]` pair
 * becomes two refs, and the server's message is read off the FetchError (§5.3).
 */
import { cn } from "~/utils/format";
import { ALL_STAGES, STAGE_LABELS } from "./constants";
import { errorMessage } from "./api";

const props = withDefaults(
  defineProps<{
    leadId: string;
    currentStage: string;
    layout?: "row" | "stack";
  }>(),
  { layout: "row" },
);

const emit = defineEmits<{ moved: [] }>();

const stage = ref(props.currentStage);
const reason = ref("");
const pending = ref(false);
const error = ref<string | null>(null);

const selectId = computed(() => `stage-${props.leadId}`);
const reasonId = computed(() => `stage-reason-${props.leadId}`);

async function submit() {
  pending.value = true;
  error.value = null;
  try {
    await $fetch(`/api/leads/${props.leadId}/stage`, {
      method: "POST",
      body: { stage: stage.value, reason: reason.value },
    });
    reason.value = "";
    emit("moved");
  } catch (e) {
    error.value = errorMessage(e, "Could not move the lead");
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <form
    :class="cn('gap-2', layout === 'row' ? 'flex flex-wrap items-end' : 'grid')"
    @submit.prevent="submit"
  >
    <div class="min-w-40 flex-1">
      <label :for="selectId" class="mb-1 block text-xs font-medium text-muted">
        Move to stage
      </label>
      <UiSelect :id="selectId" v-model="stage" name="stage">
        <option v-for="s in ALL_STAGES" :key="s" :value="s">
          {{ STAGE_LABELS[s] }}
        </option>
      </UiSelect>
    </div>
    <div class="min-w-40 flex-1">
      <label :for="reasonId" class="mb-1 block text-xs font-medium text-muted">
        Reason
      </label>
      <UiInput :id="reasonId" v-model="reason" name="reason" placeholder="Why now" />
    </div>
    <UiButton type="submit" :disabled="pending">
      {{ pending ? "Moving..." : "Move" }}
    </UiButton>
    <div class="basis-full">
      <p v-if="error" role="alert" class="text-xs text-danger">{{ error }}</p>
    </div>
  </form>
</template>
