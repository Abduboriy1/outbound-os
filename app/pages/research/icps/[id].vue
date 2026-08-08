<script setup lang="ts">
/**
 * Port of `src/app/(app)/research/icps/[id]/page.tsx`.
 *
 * The Prisma read becomes `GET /api/icps/:id`; `notFound()` becomes a fatal
 * 404 `createError`. `deleteIcpAction` redirected server-side, so the redirect
 * happens here after the DELETE resolves.
 */
import { computed } from "vue";
import IcpEditor from "~/components/research/IcpEditor.vue";
import { deleteIcpAction } from "~/components/research/actions";
import { parseWeights } from "~~/shared/scoring/weights";
import type { IcpDetail, IcpEditorValues } from "~/components/research/types";

const route = useRoute();
const id = computed(() => String(route.params.id));

const { data: icp, error } = await useFetch(() => `/api/icps/${id.value}`, {
  transform: (res: { data: IcpDetail }) => res.data,
});

if (!icp.value || error.value) {
  throw createError({ statusCode: 404, statusMessage: "Not Found", fatal: true });
}

const initial = computed<IcpEditorValues>(() => {
  const value = icp.value!;
  return {
    id: value.id,
    name: value.name,
    description: value.description ?? "",
    industries: value.industries,
    geographies: value.geographies,
    problems: value.problems,
    targetRoles: value.targetRoles,
    minEmployees: value.minEmployees,
    maxEmployees: value.maxEmployees,
    minDealSize: value.minDealSize,
    maxDealSize: value.maxDealSize,
    isDefault: value.isDefault,
    weights: parseWeights(value.weights),
    rules: value.rules.map((rule) => ({
      field: rule.field,
      operator: rule.operator,
      value: rule.value,
      weight: rule.weight,
    })),
  };
});

async function remove() {
  await deleteIcpAction(id.value);
  await navigateTo("/research/icps");
}
</script>

<template>
  <div v-if="icp">
    <UiPageHeader
      :title="icp.name"
      description="Editing this profile changes how future leads are scored; existing scores are kept until a lead is rescored."
    >
      <template #action>
        <div class="flex items-center gap-2">
          <NuxtLink to="/research/icps">
            <UiButton size="sm">Back</UiButton>
          </NuxtLink>
          <form @submit.prevent="remove">
            <UiButton size="sm" variant="danger">Delete</UiButton>
          </form>
        </div>
      </template>
    </UiPageHeader>
    <IcpEditor mode="edit" :initial="initial" />
  </div>
</template>
