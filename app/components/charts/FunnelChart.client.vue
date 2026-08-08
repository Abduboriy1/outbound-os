<script setup lang="ts">
/**
 * Port of `FunnelChart` from `src/components/charts/index.tsx`.
 *
 * Recharts has no Vue port, so the renderer is PrimeVue's `Chart` (Chart.js).
 * The prop signature is unchanged — `data: FunnelDatum[]` — as is the shape:
 * a horizontal bar chart so the stage labels stay legible, the last stage drawn
 * in the positive tone, and the tooltip reading
 * `"<count> (<n>% of previous)" — Leads`.
 *
 * `.client.vue` because Chart.js needs a canvas; there is nothing to render on
 * the server. Every number arrives already computed by the server.
 */
import Chart from "primevue/chart";
import { computed } from "vue";
import type { FunnelDatum } from "./types";

const props = defineProps<{ data: FunnelDatum[] }>();

const tokens = useChartTokens();

const height = computed(() => Math.max(200, props.data.length * 38));
const max = computed(() => Math.max(1, ...props.data.map((d) => d.count)));

const chartData = computed(() => ({
  labels: props.data.map((d) => d.label),
  datasets: [
    {
      label: "Leads",
      data: props.data.map((d) => d.count),
      backgroundColor: props.data.map((_, index) =>
        index === props.data.length - 1 ? tokens.value.positive : tokens.value.accent,
      ),
      borderRadius: 3,
      barThickness: 18,
    },
  ],
}));

const options = computed(() => ({
  indexAxis: "y" as const,
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: tokens.value.surface,
      borderColor: tokens.value.border,
      borderWidth: 1,
      titleColor: tokens.value.foreground,
      bodyColor: tokens.value.foreground,
      displayColors: false,
      callbacks: {
        label: (item: { dataIndex: number; parsed: { x: number } }) => {
          const conversion = props.data[item.dataIndex]?.conversionFromPrevious;
          const value = String(item.parsed.x);
          return conversion == null
            ? `Leads: ${value}`
            : `Leads: ${value} (${conversion}% of previous)`;
        },
      },
    },
  },
  scales: {
    x: {
      min: 0,
      max: max.value,
      ticks: { color: tokens.value.muted, font: { size: 11 } },
      grid: { color: tokens.value.border, drawTicks: false },
      border: { display: false },
    },
    y: {
      ticks: { color: tokens.value.muted, font: { size: 11 } },
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
    :style="{ height: `${height}px`, width: '100%' }"
  />
</template>
