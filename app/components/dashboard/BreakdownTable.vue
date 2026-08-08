<script setup lang="ts">
/** The private `BreakdownTable` helper of `src/app/(app)/analytics/page.tsx`. */
import type { PerformanceBucket } from "~~/server/lib/analytics/breakdown";
import { formatCurrency, percent } from "~/utils/format";

const props = defineProps<{
  title: string;
  rows: PerformanceBucket[];
  renameKey?: (key: string) => string;
}>();

const visible = computed(() => props.rows.slice(0, 12));
</script>

<template>
  <UiCard>
    <UiCardHeader :title="title" />
    <UiCardBody class="p-0">
      <p v-if="rows.length === 0" class="p-4 text-xs text-muted">No data.</p>
      <UiTable v-else>
        <thead>
          <tr>
            <UiTh>{{ title }}</UiTh>
            <UiTh class="text-right">Leads</UiTh>
            <UiTh class="text-right">Contacted</UiTh>
            <UiTh class="text-right">Reply</UiTh>
            <UiTh class="text-right">Won</UiTh>
            <UiTh class="text-right">Revenue</UiTh>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in visible" :key="row.key">
            <UiTd class="max-w-[14rem] truncate">
              {{ renameKey ? renameKey(row.key) : row.key }}
            </UiTd>
            <UiTd class="text-right tabular-nums">{{ row.leads }}</UiTd>
            <UiTd class="text-right tabular-nums text-muted">{{ row.contacted }}</UiTd>
            <UiTd class="text-right tabular-nums text-muted">
              {{ row.replied }}
              <span v-if="row.contacted > 0" class="text-muted">
                ({{ percent(row.replied, row.contacted) }}%)</span
              >
            </UiTd>
            <UiTd class="text-right tabular-nums">{{ row.won }}</UiTd>
            <UiTd class="text-right tabular-nums">
              {{ row.wonRevenue > 0 ? formatCurrency(row.wonRevenue) : "—" }}
            </UiTd>
          </tr>
        </tbody>
      </UiTable>
    </UiCardBody>
  </UiCard>
</template>
