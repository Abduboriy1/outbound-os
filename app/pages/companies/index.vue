<script setup lang="ts">
/**
 * Port of `src/app/(app)/companies/page.tsx`.
 *
 * `companyIndustries()` — the source's `distinct` query — is
 * `GET /api/companies/industries`, so the Industry filter lists every industry
 * in the book of business rather than only those on the current page of
 * companies.
 */
import { computed, reactive, watch } from "vue";
import { COMPANY_SIZES } from "~/components/leads/constants";
import type { CompanyListRow } from "~/components/leads/api-types";

const route = useRoute();

// Both are started before the first `await`, so neither composable runs outside
// the Nuxt instance context.
const listRequest = useFetch("/api/companies", {
  query: computed(() => route.query),
  transform: (res: { data: CompanyListRow[] }) => res.data,
  default: () => [] as CompanyListRow[],
});

const industriesRequest = useFetch("/api/companies/industries", {
  key: "company-industries",
  transform: (res: { data: string[] }) => res.data,
  default: () => [] as string[],
});

const [{ data: companies }, { data: industries }] = await Promise.all([
  listRequest,
  industriesRequest,
]);

const SORTS = ["name", "created", "updated"];

function one(value: unknown, fallback = ""): string {
  if (Array.isArray(value)) return String(value[0] ?? fallback);
  return value == null ? fallback : String(value);
}

const filters = reactive({ q: "", industry: "", size: "", sort: "name", dir: "asc" });

watch(
  () => route.query,
  (query) => {
    filters.q = one(query.q);
    filters.industry = one(query.industry);
    filters.size = one(query.size);
    const sort = one(query.sort, "name");
    filters.sort = SORTS.includes(sort) ? sort : "name";
    const dir = one(query.dir, "asc");
    filters.dir = dir === "desc" ? "desc" : "asc";
  },
  { immediate: true },
);

function apply() {
  return navigateTo({ path: "/companies", query: { ...filters } });
}
</script>

<template>
  <div>
    <UiPageHeader
      title="Companies"
      description="Every organisation in your book of business."
    >
      <template #action>
        <NuxtLink to="/companies/new">
          <UiButton variant="primary">New company</UiButton>
        </NuxtLink>
      </template>
    </UiPageHeader>

    <UiCard class="mb-4 p-3">
      <form class="flex flex-wrap items-end gap-2" @submit.prevent="apply">
        <div class="min-w-48 flex-1">
          <label for="q" class="mb-1 block text-xs font-medium text-muted">Search</label>
          <UiInput
            id="q"
            v-model="filters.q"
            name="q"
            placeholder="Name, domain or location"
          />
        </div>
        <div class="min-w-40">
          <label for="industry" class="mb-1 block text-xs font-medium text-muted">
            Industry
          </label>
          <UiSelect id="industry" v-model="filters.industry" name="industry">
            <option value="">All industries</option>
            <option v-for="industry in industries" :key="industry" :value="industry">
              {{ industry }}
            </option>
          </UiSelect>
        </div>
        <div class="min-w-32">
          <label for="size" class="mb-1 block text-xs font-medium text-muted">Size</label>
          <UiSelect id="size" v-model="filters.size" name="size">
            <option value="">Any size</option>
            <option v-for="size in COMPANY_SIZES" :key="size.value" :value="size.value">
              {{ size.label }}
            </option>
          </UiSelect>
        </div>
        <div class="min-w-32">
          <label for="sort" class="mb-1 block text-xs font-medium text-muted">Sort</label>
          <UiSelect id="sort" v-model="filters.sort" name="sort">
            <option value="name">Name</option>
            <option value="updated">Recently updated</option>
            <option value="created">Recently added</option>
          </UiSelect>
        </div>
        <UiButton type="submit">Apply</UiButton>
        <NuxtLink to="/companies" class="text-xs text-muted hover:text-foreground">
          Reset
        </NuxtLink>
      </form>
    </UiCard>

    <UiEmptyState
      v-if="companies.length === 0"
      title="No companies match"
      description="Adjust the filters, or add the first company to start building the pipeline."
    >
      <template #action>
        <NuxtLink to="/companies/new">
          <UiButton variant="primary" size="sm">New company</UiButton>
        </NuxtLink>
      </template>
    </UiEmptyState>

    <UiCard v-else>
      <UiTable>
        <thead>
          <tr>
            <UiTh>Company</UiTh>
            <UiTh>Industry</UiTh>
            <UiTh>Location</UiTh>
            <UiTh class="text-right">Employees</UiTh>
            <UiTh class="text-right">People</UiTh>
            <UiTh class="text-right">Leads</UiTh>
            <UiTh>Updated</UiTh>
          </tr>
        </thead>
        <tbody>
          <tr v-for="company in companies" :key="company.id" class="hover:bg-surface-muted">
            <UiTd>
              <NuxtLink
                :to="`/companies/${company.id}`"
                class="font-medium hover:text-accent"
              >
                {{ company.name }}
              </NuxtLink>
              <span v-if="company.domain" class="block text-xs text-muted">
                {{ company.domain }}
              </span>
            </UiTd>
            <UiTd class="text-muted">{{ company.industry ?? "—" }}</UiTd>
            <UiTd class="text-muted">{{ company.location ?? "—" }}</UiTd>
            <UiTd class="text-right tabular-nums">
              {{ company.employeeCount ?? company.sizeLabel ?? "—" }}
            </UiTd>
            <UiTd class="text-right tabular-nums">{{ company._count.contacts }}</UiTd>
            <UiTd class="text-right tabular-nums">{{ company._count.leads }}</UiTd>
            <UiTd class="text-muted">{{ relativeTime(company.updatedAt) }}</UiTd>
          </tr>
        </tbody>
      </UiTable>
    </UiCard>
  </div>
</template>
