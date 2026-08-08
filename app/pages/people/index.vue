<script setup lang="ts">
/** Port of `src/app/(app)/people/page.tsx`. */
import { computed, reactive, watch } from "vue";
import {
  DECISION_ROLES,
  RELATIONSHIP_STATUSES,
  humanise,
} from "~/components/leads/constants";
import { useCompanyOptions } from "~/components/leads/useOptions";
import type { ContactListRow } from "~/components/leads/api-types";

const route = useRoute();

// Both are started before the first `await`, so neither composable runs outside
// the Nuxt instance context.
const contactsRequest = useFetch("/api/contacts", {
  query: computed(() => route.query),
  transform: (res: { data: ContactListRow[] }) => res.data,
  default: () => [] as ContactListRow[],
});

const companiesRequest = useCompanyOptions();

const [{ data: contacts }, { data: companies }] = await Promise.all([
  contactsRequest,
  companiesRequest,
]);

const SORTS = ["name", "influence", "interaction"];

function one(value: unknown, fallback = ""): string {
  if (Array.isArray(value)) return String(value[0] ?? fallback);
  return value == null ? fallback : String(value);
}

const filters = reactive({
  q: "",
  companyId: "",
  decisionRole: "",
  relationshipStatus: "",
  sort: "name",
  dir: "asc",
});

watch(
  () => route.query,
  (query) => {
    filters.q = one(query.q);
    filters.companyId = one(query.companyId);
    filters.decisionRole = one(query.decisionRole);
    filters.relationshipStatus = one(query.relationshipStatus);
    const sort = one(query.sort, "name");
    filters.sort = SORTS.includes(sort) ? sort : "name";
    const dir = one(query.dir, "asc");
    filters.dir = dir === "desc" ? "desc" : "asc";
  },
  { immediate: true },
);

function apply() {
  return navigateTo({ path: "/people", query: { ...filters } });
}
</script>

<template>
  <div>
    <UiPageHeader
      title="People"
      description="Decision makers and influencers, stored independently of companies."
    >
      <template #action>
        <NuxtLink to="/people/new">
          <UiButton variant="primary">New contact</UiButton>
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
            placeholder="Name, email, title or company"
          />
        </div>
        <div class="min-w-40">
          <label for="companyId" class="mb-1 block text-xs font-medium text-muted">
            Company
          </label>
          <UiSelect id="companyId" v-model="filters.companyId" name="companyId">
            <option value="">All companies</option>
            <option v-for="company in companies" :key="company.id" :value="company.id">
              {{ company.name }}
            </option>
          </UiSelect>
        </div>
        <div class="min-w-40">
          <label for="decisionRole" class="mb-1 block text-xs font-medium text-muted">
            Decision role
          </label>
          <UiSelect id="decisionRole" v-model="filters.decisionRole" name="decisionRole">
            <option value="">Any role</option>
            <option v-for="role in DECISION_ROLES" :key="role" :value="role">
              {{ humanise(role) }}
            </option>
          </UiSelect>
        </div>
        <div class="min-w-40">
          <label
            for="relationshipStatus"
            class="mb-1 block text-xs font-medium text-muted"
          >
            Relationship
          </label>
          <UiSelect
            id="relationshipStatus"
            v-model="filters.relationshipStatus"
            name="relationshipStatus"
          >
            <option value="">Any status</option>
            <option v-for="status in RELATIONSHIP_STATUSES" :key="status" :value="status">
              {{ humanise(status) }}
            </option>
          </UiSelect>
        </div>
        <div class="min-w-36">
          <label for="sort" class="mb-1 block text-xs font-medium text-muted">Sort</label>
          <UiSelect id="sort" v-model="filters.sort" name="sort">
            <option value="name">Name</option>
            <option value="influence">Influence</option>
            <option value="interaction">Last interaction</option>
          </UiSelect>
        </div>
        <UiButton type="submit">Apply</UiButton>
        <NuxtLink to="/people" class="text-xs text-muted hover:text-foreground">
          Reset
        </NuxtLink>
      </form>
    </UiCard>

    <UiEmptyState
      v-if="contacts.length === 0"
      title="No people match"
      description="Add the person who owns the problem you solve."
    >
      <template #action>
        <NuxtLink to="/people/new">
          <UiButton variant="primary" size="sm">New contact</UiButton>
        </NuxtLink>
      </template>
    </UiEmptyState>

    <UiCard v-else>
      <UiTable>
        <thead>
          <tr>
            <UiTh>Name</UiTh>
            <UiTh>Company</UiTh>
            <UiTh>Decision role</UiTh>
            <UiTh class="text-right">Influence</UiTh>
            <UiTh>Relationship</UiTh>
            <UiTh>Last interaction</UiTh>
            <UiTh class="text-right">Leads</UiTh>
          </tr>
        </thead>
        <tbody>
          <tr v-for="contact in contacts" :key="contact.id" class="hover:bg-surface-muted">
            <UiTd>
              <NuxtLink :to="`/people/${contact.id}`" class="font-medium hover:text-accent">
                {{ contact.firstName }} {{ contact.lastName ?? "" }}
              </NuxtLink>
              <span class="block text-xs text-muted">
                {{ contact.title ?? contact.email ?? "—" }}
              </span>
            </UiTd>
            <UiTd class="text-muted">
              <NuxtLink
                v-if="contact.company"
                :to="`/companies/${contact.company.id}`"
                class="hover:text-accent"
              >
                {{ contact.company.name }}
              </NuxtLink>
              <template v-else>—</template>
            </UiTd>
            <UiTd>
              <UiBadge
                :tone="
                  contact.decisionRole === 'DECISION_MAKER'
                    ? 'accent'
                    : contact.decisionRole === 'CHAMPION'
                      ? 'positive'
                      : 'neutral'
                "
              >
                {{ humanise(contact.decisionRole) }}
              </UiBadge>
            </UiTd>
            <UiTd class="text-right tabular-nums">{{ contact.influenceScore }}</UiTd>
            <UiTd class="text-muted">{{ humanise(contact.relationshipStatus) }}</UiTd>
            <UiTd class="text-muted">{{ relativeTime(contact.lastInteractionAt) }}</UiTd>
            <UiTd class="text-right tabular-nums">{{ contact._count.leads }}</UiTd>
          </tr>
        </tbody>
      </UiTable>
    </UiCard>
  </div>
</template>
