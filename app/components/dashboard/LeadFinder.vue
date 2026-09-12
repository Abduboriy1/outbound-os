<script setup lang="ts">
/**
 * AI lead finder (plan §8) — the `search` lead source.
 *
 * Three states: describe what to look for, review what came back, commit the
 * ones you want. The review step is not optional and not skippable, because the
 * search is the one lead source whose output nobody has read before it arrives;
 * everything here is arranged so the operator can see where each company came
 * from before agreeing to it.
 *
 * Committing reuses `commitImport`, so a discovered lead is indistinguishable
 * from an imported one afterwards — same transaction, same stage history, same
 * audit row.
 */
import type { DiscoverLeadsResult } from "~~/server/lib/leads/prospect";
import { commitImport } from "./importer";
import { errorMessage } from "./api";

const emit = defineEmits<{ imported: [] }>();

type IcpRow = { id: string; name: string; isDefault: boolean };

const { data: icps } = await useFetch<{ data: IcpRow[] }>("/api/icps", {
  transform: (res) => res,
  default: () => ({ data: [] }),
});

const icpId = ref<string>("");
/** `UiInput` models a string; the route clamps the parsed value anyway. */
const count = ref("10");
const criteria = ref("");

const busy = ref(false);
const error = ref<string | null>(null);
const result = ref<DiscoverLeadsResult | null>(null);
const selected = ref<Set<string>>(new Set());
const created = ref<number | null>(null);

const icpOptions = computed(() =>
  (icps.value?.data ?? []).map((icp) => ({
    value: icp.id,
    label: icp.isDefault ? `${icp.name} (default)` : icp.name,
  })),
);

const selectedCount = computed(() => selected.value.size);

function toggle(domain: string) {
  const next = new Set(selected.value);
  if (next.has(domain)) next.delete(domain);
  else next.add(domain);
  selected.value = next;
}

async function find() {
  busy.value = true;
  error.value = null;
  created.value = null;
  result.value = null;

  try {
    const response = await $fetch<{ data: DiscoverLeadsResult }>("/api/leads/discover", {
      method: "POST",
      body: {
        icpId: icpId.value || undefined,
        count: Number(count.value) || 10,
        criteria: criteria.value.trim() || undefined,
      },
    });
    result.value = response.data;
    // Everything verified starts selected; the operator unticks what they do
    // not want, which is the lighter action when most results are usable.
    selected.value = new Set(
      response.data.candidates.map((candidate) => candidate.lead.domain!).filter(Boolean),
    );
  } catch (e) {
    error.value = errorMessage(e, "The search failed");
  } finally {
    busy.value = false;
  }
}

async function importSelected() {
  if (!result.value || selectedCount.value === 0) return;
  busy.value = true;
  error.value = null;

  try {
    const leads = result.value.candidates
      .filter((candidate) => selected.value.has(candidate.lead.domain!))
      .map((candidate) => candidate.lead);

    const outcome = await commitImport(leads, "SEARCH_PROVIDER");
    created.value = outcome.created;
    result.value = null;
    selected.value = new Set();
    emit("imported");
  } catch (e) {
    error.value = errorMessage(e, "Could not import the selected leads");
  } finally {
    busy.value = false;
  }
}

function reset() {
  result.value = null;
  error.value = null;
  created.value = null;
}
</script>

<template>
  <UiCard>
    <UiCardHeader
      title="Find leads with AI"
      description="Searches the web for companies matching your ICP, then verifies each one against the pages it actually read. Nothing is created until you approve it."
    />
    <UiCardBody class="space-y-4">
      <!-- ------------------------------------------------------------ form -->
      <form v-if="!result" class="grid gap-3 sm:grid-cols-2" @submit.prevent="find">
        <UiField label="Ideal customer profile">
          <UiSelect v-model="icpId">
            <option value="">Default profile</option>
            <option v-for="option in icpOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </UiSelect>
        </UiField>

        <UiField label="How many to look for">
          <UiInput v-model="count" type="number" min="1" max="25" />
        </UiField>

        <div class="sm:col-span-2">
          <UiField
            label="Extra criteria"
            hint="Optional. Narrows this run only — e.g. 'family-owned, hiring an operations manager'."
          >
            <UiTextarea v-model="criteria" rows="2" placeholder="Leave blank to use the ICP alone" />
          </UiField>
        </div>

        <div class="flex flex-wrap items-center gap-3 sm:col-span-2">
          <UiButton type="submit" variant="primary" :disabled="busy">
            {{ busy ? "Searching" : "Find leads" }}
          </UiButton>
          <span v-if="busy" class="text-xs text-muted">
            This runs a live web search and takes up to a minute.
          </span>
          <span v-else-if="created !== null" class="text-xs text-positive">
            Imported {{ created }} lead{{ created === 1 ? "" : "s" }}. They are queued for research.
          </span>
        </div>
      </form>

      <!-- ---------------------------------------------------------- results -->
      <div v-else class="space-y-4">
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="font-medium">
            {{ result.candidates.length }} verified
            compan{{ result.candidates.length === 1 ? "y" : "ies" }}
          </span>
          <UiBadge v-if="result.rejected.length" tone="warning">
            {{ result.rejected.length }} unverified, dropped
          </UiBadge>
          <UiBadge v-if="result.duplicates.length" tone="neutral">
            {{ result.duplicates.length }} already in the pipeline
          </UiBadge>
          <span class="text-xs text-muted">
            {{ result.strategy === "search-api" ? "web search" : "provider grounding" }} ·
            {{ result.provider }} · {{ result.model }}
          </span>
        </div>

        <p
          v-for="warning in result.warnings"
          :key="warning"
          class="rounded border border-warning-soft bg-warning-soft px-2 py-1 text-xs text-warning"
        >
          {{ warning }}
        </p>

        <UiEmptyState
          v-if="result.candidates.length === 0"
          title="Nothing verified"
          description="The search found no company it could tie back to a page it actually read. Try broader criteria, or a different ICP."
        />

        <div v-else class="overflow-x-auto">
          <UiTable>
            <thead>
              <tr>
                <UiTh class="w-8" />
                <UiTh>Company</UiTh>
                <UiTh>Why it matched</UiTh>
                <UiTh>Verified</UiTh>
              </tr>
            </thead>
            <tbody>
              <tr v-for="candidate in result.candidates" :key="candidate.lead.domain!">
                <UiTd>
                  <input
                    type="checkbox"
                    :checked="selected.has(candidate.lead.domain!)"
                    :aria-label="`Import ${candidate.lead.companyName}`"
                    @change="toggle(candidate.lead.domain!)"
                  >
                </UiTd>
                <UiTd>
                  <div class="font-medium">{{ candidate.lead.companyName }}</div>
                  <div class="text-xs text-muted">
                    {{ candidate.lead.domain }}
                    <template v-if="candidate.lead.location"> · {{ candidate.lead.location }}</template>
                    <template v-if="candidate.lead.industry"> · {{ candidate.lead.industry }}</template>
                  </div>
                </UiTd>
                <UiTd class="max-w-md text-xs">
                  {{ candidate.matchReason }}
                  <a
                    v-if="candidate.sourceUrl"
                    :href="candidate.sourceUrl"
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    class="block text-accent hover:underline"
                  >
                    source
                  </a>
                </UiTd>
                <UiTd>
                  <UiBadge :tone="candidate.verifiedBy === 'live' ? 'positive' : 'accent'">
                    {{ candidate.verifiedBy === "live" ? "Domain responded" : "Cited by search" }}
                  </UiBadge>
                </UiTd>
              </tr>
            </tbody>
          </UiTable>
        </div>

        <details v-if="result.rejected.length" class="text-xs text-muted">
          <summary class="cursor-pointer">
            {{ result.rejected.length }} dropped as unverified
          </summary>
          <ul class="mt-1 space-y-1">
            <li v-for="row in result.rejected" :key="`${row.name}-${row.domain}`">
              <span class="font-medium">{{ row.name }}</span>
              <template v-if="row.domain"> ({{ row.domain }})</template> — {{ row.reason }}
            </li>
          </ul>
        </details>

        <details v-if="result.notes.length" class="text-xs text-muted">
          <summary class="cursor-pointer">What the search could not establish</summary>
          <ul class="mt-1 space-y-1">
            <li v-for="note in result.notes" :key="note">{{ note }}</li>
          </ul>
        </details>

        <div class="flex flex-wrap items-center gap-3">
          <UiButton
            variant="primary"
            :disabled="busy || selectedCount === 0"
            @click="importSelected"
          >
            {{ busy ? "Importing" : `Import ${selectedCount} selected` }}
          </UiButton>
          <UiButton variant="ghost" :disabled="busy" @click="reset">Discard</UiButton>
        </div>
      </div>

      <p v-if="error" class="text-xs text-danger">{{ error }}</p>
    </UiCardBody>
  </UiCard>
</template>
