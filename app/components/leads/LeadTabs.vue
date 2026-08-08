<script setup lang="ts">
/**
 * Port of `LeadTabs` from `src/components/leads/workspace.tsx`.
 * `usePathname()` becomes `useRoute().path`; `next/link` becomes `NuxtLink`.
 */
import { computed } from "vue";

const props = defineProps<{ leadId: string }>();

const TABS = [
  { segment: "", label: "Overview" },
  { segment: "research", label: "Research" },
  { segment: "people", label: "People" },
  { segment: "opportunities", label: "Opportunities" },
  { segment: "activity", label: "Activity" },
  { segment: "emails", label: "Emails" },
  { segment: "meetings", label: "Meetings" },
  { segment: "tasks", label: "Tasks" },
  { segment: "proposal", label: "Proposal" },
];

const route = useRoute();

const tabs = computed(() => {
  const base = `/leads/${props.leadId}`;
  return TABS.map((tab) => {
    const href = tab.segment ? `${base}/${tab.segment}` : base;
    return { ...tab, href, active: route.path === href };
  });
});
</script>

<template>
  <nav aria-label="Lead workspace" class="border-b border-border">
    <ul class="-mb-px flex flex-wrap gap-1 overflow-x-auto">
      <li v-for="tab in tabs" :key="tab.label">
        <NuxtLink
          :to="tab.href"
          :aria-current="tab.active ? 'page' : undefined"
          :class="
            cn(
              'inline-block border-b-2 px-3 py-2 text-sm whitespace-nowrap transition',
              tab.active
                ? 'border-accent font-medium text-accent'
                : 'border-transparent text-muted hover:text-foreground',
            )
          "
        >
          {{ tab.label }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
