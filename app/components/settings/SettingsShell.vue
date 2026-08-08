<script setup lang="ts">
/**
 * Port of `src/app/(app)/settings/layout.tsx`.
 *
 * Nuxt layouts are flat — there is no layout at `/settings` depth — so
 * MIGRATION.md §6 offers two ways out, and this is the wrapper-component one:
 * each `app/pages/settings/*.vue` renders its body inside `<SettingsShell>`.
 * The markup, the tab list and the class strings are the source's.
 */
const TABS = [
  { href: '/settings', label: 'Overview' },
  { href: '/settings/integrations', label: 'Integrations' },
  { href: '/settings/email', label: 'Email' },
  { href: '/settings/ai', label: 'AI' },
  { href: '/settings/automation', label: 'Automation' },
  { href: '/settings/compliance', label: 'Compliance' },
]
</script>

<template>
  <div>
    <UiPageHeader
      title="Settings"
      description="Which providers are active, what it takes to switch, and how much the AI is allowed to do on its own."
    />
    <nav class="mb-5 flex flex-wrap gap-1 border-b border-border pb-2 text-sm">
      <NuxtLink
        v-for="tab in TABS"
        :key="tab.href"
        :to="tab.href"
        class="rounded-md px-2.5 py-1 text-muted transition hover:bg-surface-muted hover:text-foreground"
      >
        {{ tab.label }}
      </NuxtLink>
    </nav>
    <slot />
  </div>
</template>
