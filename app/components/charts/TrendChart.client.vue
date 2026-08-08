<script setup lang="ts">
/**
 * Port of `TrendChart` from `src/components/charts/index.tsx`.
 *
 * Same prop signature (`data: TrendDatum[]`) and the same composed shape:
 * leads created and deals won as bars on the left axis, won revenue as a line
 * on a right-hand axis formatted as compact currency, 260px tall.
 */
import Chart from "primevue/chart";
import { computed } from "vue";
import type { TrendDatum } from "./types";

const props = defineProps<{ data: TrendDatum[] }>();

const tokens = useChartTokens();

function compactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

const chartData = computed(() => ({
  labels: props.data.map((d) => d.month),
  datasets: [
    {
      type: "bar" as const,
      label: "Leads created",
      yAxisID: "count",
      data: props.data.map((d) => d.created),
      backgroundColor: tokens.value.accent,
      borderRadius: 3,
      barThickness: 14,
      order: 2,
    },
    {
      type: "bar" as const,
      label: "Deals won",
      yAxisID: "count",
      data: props.data.map((d) => d.won),
      backgroundColor: tokens.value.positive,
      borderRadius: 3,
      barThickness: 14,
      order: 2,
    },
    {
      type: "line" as const,
      label: "Won revenue",
      yAxisID: "revenue",
      data: props.data.map((d) => d.wonRevenue),
      borderColor: tokens.value.warning,
      backgroundColor: tokens.value.warning,
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.4,
      order: 1,
    },
  ],
}));

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index" as const, intersect: false },
  plugins: {
    legend: {
      display: true,
      labels: { color: tokens.value.muted, font: { size: 11 }, boxWidth: 10 },
    },
    tooltip: {
      backgroundColor: tokens.value.surface,
      borderColor: tokens.value.border,
      borderWidth: 1,
      titleColor: tokens.value.foreground,
      bodyColor: tokens.value.foreground,
      callbacks: {
        label: (item: { dataset: { label?: string }; parsed: { y: number } }) =>
          item.dataset.label === "Won revenue"
            ? `Won revenue: ${compactCurrency(item.parsed.y)}`
            : `${item.dataset.label}: ${item.parsed.y}`,
      },
    },
  },
  scales: {
    x: {
      ticks: { color: tokens.value.muted, font: { size: 11 } },
      grid: { display: false },
      border: { display: false },
    },
    count: {
      position: "left" as const,
      ticks: { color: tokens.value.muted, font: { size: 11 } },
      grid: { color: tokens.value.border },
      border: { display: false },
    },
    revenue: {
      position: "right" as const,
      ticks: {
        color: tokens.value.muted,
        font: { size: 11 },
        callback: (value: string | number) => compactCurrency(Number(value)),
      },
      grid: { display: false },
      border: { display: false },
    },
  },
}));
</script>

<template>
  <Chart
    type="bar"
    :data="chartData"
    :options="options"
    :style="{ height: '260px', width: '100%' }"
  />
</template>
