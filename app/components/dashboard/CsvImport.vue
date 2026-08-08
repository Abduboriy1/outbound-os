<script setup lang="ts">
/**
 * Port of `CsvImport` from `src/app/(app)/import/csv-import.tsx`.
 *
 * CSV import (plan §8): upload, map columns, preview what would be created and
 * what is a duplicate, then commit. Parsing and mapping happen in the browser
 * so the file never has to be uploaded to see whether it is usable.
 *
 * `previewImportAction` / `commitImportAction` were server actions; see
 * `importer.ts` for how they are composed from §4 endpoints. The parsing,
 * mapping, validation and dedupe code is the source's, unchanged.
 */
import {
  CSV_FIELDS,
  CSV_FIELD_LABELS,
  DUPLICATE_REASON_LABELS,
  guessMapping,
  mapRows,
  missingRequiredFields,
  parseCsv,
  type CsvField,
  type CsvMapping,
  type DiscoveredLead,
  type RowIssue,
} from "~~/shared/leadsources";
import { commitImport, previewImport, type ImportPreview } from "./importer";

type Stage = "upload" | "map" | "preview" | "done";

const emit = defineEmits<{ imported: [] }>();

const stage = ref<Stage>("upload");
const fileName = ref("");
const headers = ref<string[]>([]);
const rows = ref<string[][]>([]);
const mapping = ref<CsvMapping>({});
const issues = ref<RowIssue[]>([]);
const leads = ref<DiscoveredLead[]>([]);
const preview = ref<ImportPreview | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);
const created = ref(0);

const missing = computed(() => missingRequiredFields(mapping.value));

async function onFile(file: File) {
  error.value = null;
  const text = await file.text();
  const parsed = parseCsv(text);
  if (parsed.headers.length === 0) {
    error.value = "That file has no readable header row.";
    return;
  }
  fileName.value = file.name;
  headers.value = parsed.headers;
  rows.value = parsed.rows;
  mapping.value = guessMapping(parsed.headers);
  stage.value = "map";
}

function onFileInput(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) void onFile(file);
}

async function buildPreview() {
  busy.value = true;
  error.value = null;
  const mapped = mapRows(rows.value, mapping.value);
  issues.value = mapped.issues;
  leads.value = mapped.leads;

  if (mapped.leads.length === 0) {
    error.value = "No rows could be read with this mapping.";
    busy.value = false;
    return;
  }

  try {
    preview.value = await previewImport(mapped.leads);
    stage.value = "preview";
  } catch {
    error.value = "Could not check for duplicates.";
  } finally {
    busy.value = false;
  }
}

async function commit() {
  if (!preview.value) return;
  busy.value = true;
  try {
    const result = await commitImport(
      preview.value.unique.map((entry) => entry.lead),
      "CSV",
    );
    if (result.error) {
      error.value = result.error;
      return;
    }
    created.value = result.created;
    stage.value = "done";
    emit("imported");
  } catch {
    error.value = "Import failed.";
  } finally {
    busy.value = false;
  }
}

function reset() {
  stage.value = "upload";
  headers.value = [];
  rows.value = [];
  mapping.value = {};
  issues.value = [];
  leads.value = [];
  preview.value = null;
  created.value = 0;
  error.value = null;
}

/**
 * Keeps the mapping one-to-one: assigning a column steals it from any other
 * field. The source rebuilt the object with `delete`; this filters instead,
 * which the lint config forbids doing dynamically, with the same result.
 */
function applyMapping(field: CsvField, column: number | null) {
  const entries = Object.entries(mapping.value) as [CsvField, number][];
  if (column == null) {
    mapping.value = Object.fromEntries(
      entries.filter(([key]) => key !== field),
    ) as CsvMapping;
    return;
  }
  const kept = entries.filter(([key, value]) => key !== field && value !== column);
  mapping.value = Object.fromEntries([...kept, [field, column]]) as CsvMapping;
}

function onMappingChange(field: CsvField, event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  applyMapping(field, value === "" ? null : Number(value));
}

function contactLabel(lead: DiscoveredLead) {
  const name =
    [lead.contactFirstName, lead.contactLastName].filter(Boolean).join(" ") || "—";
  return name + (lead.contactEmail ? ` (${lead.contactEmail})` : "");
}
</script>

<template>
  <UiCard>
    <UiCardHeader
      title="Import a CSV"
      description="Map the columns, check the preview, then commit. Nothing is written until you press Import."
    >
      <template #action>
        <UiButton v-if="stage !== 'upload'" size="sm" @click="reset">
          Start over
        </UiButton>
      </template>
    </UiCardHeader>
    <UiCardBody class="space-y-4">
      <p v-if="error" class="text-sm text-danger">{{ error }}</p>

      <UiField
        v-if="stage === 'upload'"
        label="CSV file"
        hint="A header row plus one company per row. Column names are matched automatically where possible."
      >
        <input
          type="file"
          accept=".csv,text/csv"
          class="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm"
          @change="onFileInput"
        >
      </UiField>

      <template v-if="stage === 'map'">
        <p class="text-xs text-muted">
          {{ fileName }} &middot; {{ rows.length }} data rows
        </p>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <UiField
            v-for="field in CSV_FIELDS"
            :key="field"
            :label="CSV_FIELD_LABELS[field]"
            :error="missing.includes(field) ? 'Required' : undefined"
          >
            <UiSelect
              :model-value="mapping[field] ?? ''"
              @change="onMappingChange(field, $event)"
            >
              <option value="">Not imported</option>
              <option
                v-for="(header, index) in headers"
                :key="`${header}-${index}`"
                :value="index"
              >
                {{ header || `Column ${index + 1}` }}
              </option>
            </UiSelect>
          </UiField>
        </div>
        <UiButton
          variant="primary"
          :disabled="busy || missing.length > 0"
          @click="buildPreview"
        >
          {{ busy ? "Checking" : "Preview import" }}
        </UiButton>
      </template>

      <template v-if="stage === 'preview' && preview">
        <div class="flex flex-wrap items-center gap-3 text-sm">
          <UiBadge tone="positive">{{ preview.unique.length }} to create</UiBadge>
          <UiBadge tone="warning">
            {{ preview.duplicates.length }} duplicates skipped
          </UiBadge>
          <UiBadge v-if="issues.length > 0" tone="danger">
            {{ issues.length }} row problems
          </UiBadge>
          <span class="text-xs text-muted">
            {{ leads.length }} of {{ rows.length }} rows readable
          </span>
        </div>

        <div
          v-if="preview.unique.length > 0"
          class="max-h-80 overflow-y-auto rounded-md border border-border"
        >
          <UiTable>
            <thead class="sticky top-0 bg-surface">
              <tr>
                <UiTh>Company</UiTh>
                <UiTh>Domain</UiTh>
                <UiTh>Contact</UiTh>
                <UiTh>Industry</UiTh>
                <UiTh class="text-right">Employees</UiTh>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in preview.unique.slice(0, 200)" :key="entry.index">
                <UiTd>{{ entry.lead.companyName }}</UiTd>
                <UiTd class="text-muted">{{ entry.lead.domain ?? "—" }}</UiTd>
                <UiTd class="text-muted">{{ contactLabel(entry.lead) }}</UiTd>
                <UiTd class="text-muted">{{ entry.lead.industry ?? "—" }}</UiTd>
                <UiTd class="text-right tabular-nums text-muted">
                  {{ entry.lead.employeeCount ?? "—" }}
                </UiTd>
              </tr>
            </tbody>
          </UiTable>
        </div>
        <p v-else class="text-sm text-muted">
          Every row in this file is already in the pipeline.
        </p>

        <details
          v-if="preview.duplicates.length > 0"
          class="rounded-md border border-border p-3"
        >
          <summary class="cursor-pointer text-sm">
            Duplicates ({{ preview.duplicates.length }})
          </summary>
          <ul class="mt-2 space-y-1 text-xs text-muted">
            <li v-for="dup in preview.duplicates.slice(0, 100)" :key="dup.index">
              {{ dup.lead.companyName }} — {{ DUPLICATE_REASON_LABELS[dup.reason] }} ({{
                dup.matched
              }})
            </li>
          </ul>
        </details>

        <details v-if="issues.length > 0" class="rounded-md border border-border p-3">
          <summary class="cursor-pointer text-sm">
            Row problems ({{ issues.length }})
          </summary>
          <ul class="mt-2 space-y-1 text-xs text-muted">
            <li
              v-for="(issue, i) in issues.slice(0, 100)"
              :key="`${issue.row}-${i}`"
            >
              Row {{ issue.row }}: {{ issue.message }}
            </li>
          </ul>
        </details>

        <UiButton
          variant="primary"
          :disabled="busy || preview.unique.length === 0"
          @click="commit"
        >
          {{ busy ? "Importing" : `Import ${preview.unique.length} leads` }}
        </UiButton>
      </template>

      <div v-if="stage === 'done'" class="space-y-2">
        <p class="text-sm text-positive">
          Imported {{ created }} leads. They are in the pipeline at Prospect, waiting for
          research.
        </p>
        <UiButton @click="reset">Import another file</UiButton>
      </div>
    </UiCardBody>
  </UiCard>
</template>
