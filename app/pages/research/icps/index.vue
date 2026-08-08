<script setup lang="ts">
/**
 * Port of `src/app/(app)/research/icps/page.tsx`.
 *
 * Plan §7 — reusable ideal customer profiles. The Prisma query becomes
 * `GET /api/icps`, which returns the rules inline, so `_count.rules` is
 * `rules.length` here.
 */
import { parseWeights } from "~~/shared/scoring/weights";
import { makeDefaultIcpAction } from "~/components/research/actions";
import type { IcpEditorValues, IcpListRow } from "~/components/research/types";

const { data: icps, refresh } = await useFetch("/api/icps", {
  transform: (res: { data: IcpListRow[] }) => res.data,
  default: () => [] as IcpListRow[],
});

/** The private `Detail` component in the source, as data. */
function details(icp: IcpListRow) {
  return [
    { label: "Industries", value: icp.industries.slice(0, 3).join(", ") },
    { label: "Roles", value: icp.targetRoles.slice(0, 3).join(", ") },
    {
      label: "Employees",
      value:
        icp.minEmployees == null && icp.maxEmployees == null
          ? "—"
          : `${icp.minEmployees ?? "0"}–${icp.maxEmployees ?? "∞"}`,
    },
    { label: "Deal size", value: formatRange(icp.minDealSize, icp.maxDealSize) },
  ];
}

function toEditorValues(icp: IcpListRow): IcpEditorValues {
  return {
    id: icp.id,
    name: icp.name,
    description: icp.description ?? "",
    industries: icp.industries,
    geographies: icp.geographies,
    problems: icp.problems,
    targetRoles: icp.targetRoles,
    minEmployees: icp.minEmployees,
    maxEmployees: icp.maxEmployees,
    minDealSize: icp.minDealSize,
    maxDealSize: icp.maxDealSize,
    isDefault: icp.isDefault,
    weights: parseWeights(icp.weights),
    rules: icp.rules,
  };
}

async function makeDefault(icp: IcpListRow) {
  await makeDefaultIcpAction(toEditorValues(icp));
  await refresh();
}
</script>

<template>
  <div>
    <UiPageHeader
      title="Ideal customer profiles"
      description="Who you are targeting, and how leads are scored against it."
    >
      <template #action>
        <NuxtLink to="/research/icps/new">
          <UiButton variant="primary">New ICP</UiButton>
        </NuxtLink>
      </template>
    </UiPageHeader>

    <UiEmptyState
      v-if="icps.length === 0"
      title="No profiles yet"
      description="Define who you sell to so leads can be scored for fit. The builder can interview you and propose a first draft."
    >
      <template #action>
        <NuxtLink to="/research/icps/new">
          <UiButton variant="primary">Create the first ICP</UiButton>
        </NuxtLink>
      </template>
    </UiEmptyState>

    <div v-else class="grid gap-3 md:grid-cols-2">
      <UiCard v-for="icp in icps" :key="icp.id">
        <UiCardBody class="space-y-2">
          <div class="flex items-start justify-between gap-2">
            <NuxtLink
              :to="`/research/icps/${icp.id}`"
              class="text-sm font-medium hover:text-accent"
            >
              {{ icp.name }}
            </NuxtLink>
            <UiBadge v-if="icp.isDefault" tone="accent">Default</UiBadge>
          </div>

          <p v-if="icp.description" class="line-clamp-2 text-xs text-muted">
            {{ icp.description }}
          </p>

          <dl class="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <div v-for="detail in details(icp)" :key="detail.label" class="min-w-0">
              <dt class="text-muted">{{ detail.label }}</dt>
              <dd class="truncate">{{ detail.value || "—" }}</dd>
            </div>
          </dl>

          <div class="flex items-center justify-between gap-2 pt-1">
            <span class="text-xs text-muted">
              {{ icp._count.leads }} leads &middot; {{ icp.rules.length }} rules
            </span>
            <form v-if="!icp.isDefault" @submit.prevent="makeDefault(icp)">
              <UiButton size="sm" variant="ghost">Make default</UiButton>
            </form>
          </div>
        </UiCardBody>
      </UiCard>
    </div>
  </div>
</template>
