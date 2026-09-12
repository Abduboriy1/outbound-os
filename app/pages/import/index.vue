<script setup lang="ts">
/**
 * Port of `src/app/(app)/import/page.tsx`.
 *
 * Plan §8 — lead discovery through pluggable sources. Manual entry and CSV are
 * the two that need no third-party account; the AI finder is the `search`
 * source, and a directory provider plugs into the same interface later.
 *
 * The page was a server component reading `env().APP_URL`. Server env is not
 * readable from a page, and exposing it would mean a `runtimeConfig.public`
 * entry in `nuxt.config.ts`, which this agent does not own — so the intake URL
 * is built from the request origin, which is the same value in every
 * correctly-configured deployment. The private `Source` helper is inlined as a
 * `v-for` over the same three rows.
 */
const origin = useRequestURL().origin;

const sources = computed(() => [
  {
    name: "Website form",
    status: "Active",
    detail: `Inbound submissions post to ${origin}/api/intake with a bearer token and arrive as WEBSITE_FORM leads.`,
  },
  {
    name: "Referrals",
    status: "Manual",
    detail: "Add a referred company through the form above and set the source detail.",
  },
  {
    name: "AI search",
    status: "Active",
    detail:
      "The lead finder above searches the web against your ICP and offers only companies it can tie back to a page it read.",
  },
  {
    name: "Directory providers",
    status: "Not configured",
    detail:
      "A directory or registry source plugs into the same LeadProvider interface as the finder.",
  },
]);
</script>

<template>
  <div>
    <UiPageHeader
      title="Import leads"
      description="Add companies by hand or from a spreadsheet. Duplicates are detected by domain and email before anything is written."
    />

    <div class="space-y-4">
      <DashboardLeadFinder />

      <div class="grid gap-4 lg:grid-cols-2">
        <DashboardManualLeadForm />
        <DashboardCsvImport />
      </div>

      <UiCard>
        <UiCardHeader
          title="Other sources"
          description="Every source implements the same LeadProvider interface, so none of them is load-bearing."
        />
        <UiCardBody class="space-y-2 text-sm">
          <div
            v-for="source in sources"
            :key="source.name"
            class="flex flex-wrap items-baseline gap-2 border-b border-border pb-2 last:border-0"
          >
            <span class="font-medium">{{ source.name }}</span>
            <span class="text-xs text-muted">{{ source.status }}</span>
            <span class="w-full text-xs text-muted">{{ source.detail }}</span>
          </div>
          <p class="pt-1 text-xs text-muted">
            Imported leads land at Prospect and appear in
            <NuxtLink to="/research/queue" class="text-accent hover:underline">
              the research queue
            </NuxtLink>
            .
          </p>
        </UiCardBody>
      </UiCard>
    </div>
  </div>
</template>
