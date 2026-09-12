<script setup lang="ts">
/**
 * The agent's step log for one research run, split into its two subjects:
 * what was researched about the company, and what was found about its people.
 * While the run is open the parent polls the report, so this list grows live;
 * afterwards the same events read as the run's history.
 */
import { computed } from "vue";
import type { Tone } from "~~/shared/tone";
import UiBadge from "~/components/ui/UiBadge.vue";
import UiCard from "~/components/ui/UiCard.vue";
import UiCardBody from "~/components/ui/UiCardBody.vue";
import UiCardHeader from "~/components/ui/UiCardHeader.vue";
import type { ResearchProgressEvent } from "./types";

const props = defineProps<{
  events: ResearchProgressEvent[];
  /** Open run: show a pulse on the newest step of each section. */
  live?: boolean;
}>();

const SECTIONS = [
  {
    key: "company" as const,
    title: "Company research",
    description: "Pages fetched, analysis, signals and opportunities.",
  },
  {
    key: "people" as const,
    title: "People research",
    description: "Names, email addresses, and the contacts added to People.",
  },
];

const bySection = computed(() => ({
  company: props.events.filter((event) => event.section === "company"),
  people: props.events.filter((event) => event.section === "people"),
}));

const STATUS_TONES: Record<ResearchProgressEvent["status"], Tone> = {
  started: "accent",
  done: "positive",
  warning: "warning",
  failed: "danger",
};

const STATUS_LABELS: Record<ResearchProgressEvent["status"], string> = {
  started: "running",
  done: "done",
  warning: "note",
  failed: "failed",
};

function isLatestOpen(section: "company" | "people", index: number) {
  const events = bySection.value[section];
  return props.live && index === events.length - 1 && events[index]?.status === "started";
}
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-2">
    <UiCard v-for="section in SECTIONS" :key="section.key">
      <UiCardHeader :title="section.title" :description="section.description" />
      <UiCardBody>
        <p
          v-if="bySection[section.key].length === 0"
          class="text-sm text-muted"
        >
          {{ live ? "Waiting for this part to start…" : "Nothing was recorded." }}
        </p>
        <ol v-else class="space-y-3">
          <li
            v-for="(event, index) in bySection[section.key]"
            :key="`${event.stage}-${index}`"
            class="border-l-2 pl-3"
            :class="event.status === 'failed' ? 'border-danger' : 'border-border'"
          >
            <p class="flex flex-wrap items-center gap-2 text-sm">
              <span
                v-if="isLatestOpen(section.key, index)"
                class="inline-block h-2 w-2 animate-pulse rounded-full bg-accent"
                aria-hidden="true"
              />
              {{ event.label }}
              <UiBadge :tone="STATUS_TONES[event.status]">
                {{ STATUS_LABELS[event.status] }}
              </UiBadge>
            </p>
            <p v-if="event.detail" class="mt-0.5 text-xs text-muted">
              {{ event.detail }}
            </p>
            <p class="mt-0.5 text-xs text-muted/70">{{ relativeTime(event.at) }}</p>
          </li>
        </ol>
      </UiCardBody>
    </UiCard>
  </div>
</template>
