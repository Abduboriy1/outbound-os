<script setup lang="ts">
/**
 * Port of `src/components/nav.tsx` (`SidebarNav`), now rendered as a PrimeVue
 * `Tree`.
 *
 * The section list and the active-link rule are unchanged: `/` matches exactly,
 * everything else matches by prefix. What changed is the presentation — the flat
 * `<ul>` groups under an uppercase caption read as one undifferentiated list, so
 * each labelled section is a collapsible parent node and its pages are children.
 * Unlabelled groups (Dashboard, and the Analytics/Goals/Tasks/Settings tail) stay
 * top-level leaves.
 *
 * Nodes render real `<NuxtLink>`s through the `#default` slot rather than relying
 * on Tree selection, so middle-click and cmd-click still open pages in a new tab
 * and the active style is the source's. Tree contributes the structure, the
 * chevrons and the expand/collapse state. Navigation follows plan §43.
 */
import Tree from "primevue/tree";
import type { TreeNode } from "primevue/treenode";
import { cn } from "~/utils/format";

const emit = defineEmits<{ navigate: [] }>();

type NavItem = { href: string; label: string };

const SECTIONS: { label: string | null; items: NavItem[] }[] = [
  { label: null, items: [{ href: "/", label: "Dashboard" }] },
  {
    label: "Sales",
    items: [
      { href: "/leads", label: "Leads" },
      { href: "/companies", label: "Companies" },
      { href: "/people", label: "People" },
      { href: "/pipeline", label: "Pipeline" },
      { href: "/opportunities", label: "Opportunities" },
      { href: "/import", label: "Import" },
    ],
  },
  {
    label: "Outreach",
    items: [
      { href: "/outreach/approvals", label: "Approval Queue" },
      { href: "/outreach/inbox", label: "Inbox" },
      { href: "/outreach/sequences", label: "Sequences" },
      { href: "/outreach/templates", label: "Templates" },
    ],
  },
  {
    label: "Research",
    items: [
      { href: "/research/queue", label: "Research Queue" },
      { href: "/research/signals", label: "Signals" },
      { href: "/research/icps", label: "ICPs" },
    ],
  },
  {
    label: "Deals",
    items: [
      { href: "/deals/discovery", label: "Discovery" },
      { href: "/deals/proposals", label: "Proposals" },
      { href: "/deals/closed", label: "Won / Lost" },
    ],
  },
  {
    label: null,
    items: [
      { href: "/analytics", label: "Analytics" },
      { href: "/goals", label: "Goals" },
      { href: "/tasks", label: "Tasks" },
      { href: "/settings", label: "Settings" },
    ],
  },
];

/** A leaf's key is its href, so route matching and node keys are the same thing. */
function toLeaf(item: NavItem): TreeNode {
  return { key: item.href, label: item.label, leaf: true, data: { href: item.href } };
}

const NODES: TreeNode[] = SECTIONS.flatMap((section) =>
  section.label
    ? [
        {
          key: `section:${section.label}`,
          label: section.label,
          children: section.items.map(toLeaf),
        },
      ]
    : section.items.map(toLeaf),
);

/** Sections a page lives under, keyed by href, for the auto-expand watcher. */
const SECTION_OF = new Map<string, string>(
  NODES.filter((node) => node.children).flatMap((section) =>
    section.children!.map((child) => [child.key as string, section.key as string]),
  ),
);

/** Everything starts open: collapsing a section is an opt-in, not a default. */
const expandedKeys = ref<Record<string, boolean>>(
  Object.fromEntries(
    NODES.filter((node) => node.children).map((node) => [node.key as string, true]),
  ),
);

const route = useRoute();

function isActive(href: string) {
  return href === "/" ? route.path === "/" : route.path.startsWith(href);
}

/* A section the user collapsed stays collapsed until they navigate into it. */
watch(
  () => route.path,
  () => {
    for (const [href, sectionKey] of SECTION_OF) {
      if (isActive(href) && !expandedKeys.value[sectionKey]) {
        expandedKeys.value = { ...expandedKeys.value, [sectionKey]: true };
      }
    }
  },
  { immediate: true },
);

/**
 * The chevron button Tree renders already toggles; this makes the caption itself
 * a hit target too, which is what a section header is expected to do.
 */
function toggleSection(node: TreeNode) {
  const key = node.key as string;
  expandedKeys.value = { ...expandedKeys.value, [key]: !expandedKeys.value[key] };
}

/**
 * Tree's own padding and background are removed: the sidebar supplies both, and
 * the node rows need to sit as tight as the hand-rolled list they replace.
 */
const TREE_PT = {
  root: { class: "w-full border-0 bg-transparent p-0 text-sm" },
  rootChildren: { class: "gap-0" },
  nodeChildren: { class: "gap-0 pl-3" },
  node: { class: "p-0" },
  nodeContent: { class: "gap-0.5 rounded-md p-0" },
  nodeToggleButton: { class: "size-6 shrink-0" },
  nodeToggleIcon: { class: "size-3.5 text-muted" },
  nodeLabel: { class: "min-w-0 flex-1" },
};
</script>

<template>
  <nav>
    <Tree
      v-model:expanded-keys="expandedKeys"
      :value="NODES"
      :pt="TREE_PT"
      class="text-sm"
    >
      <template #default="{ node }">
        <button
          v-if="node.children"
          type="button"
          class="w-full cursor-pointer rounded-md py-1 text-left text-[11px] font-semibold tracking-wide text-muted uppercase hover:text-foreground"
          @click="toggleSection(node)"
        >
          {{ node.label }}
        </button>
        <NuxtLink
          v-else
          :to="node.data.href"
          :class="
            cn(
              'block rounded-md px-2 py-1.5 transition',
              isActive(node.data.href)
                ? 'bg-accent-soft font-medium text-accent'
                : 'text-muted hover:bg-surface-muted hover:text-foreground',
            )
          "
          @click="emit('navigate')"
        >
          {{ node.label }}
        </NuxtLink>
      </template>
    </Tree>
  </nav>
</template>
