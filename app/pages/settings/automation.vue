<script setup lang="ts">
/**
 * Port of `src/app/(app)/settings/automation/page.tsx`.
 *
 * The Next page was a thin server component: read the saved rows, overlay them
 * on the defaults, hand the map to the client form. The overlay now happens in
 * `GET /api/settings/automation`, so this is thinner still.
 */
import SettingsAutomationForm from '~/components/settings/SettingsAutomationForm.vue'
import SettingsShell from '~/components/settings/SettingsShell.vue'
import type { ApprovalMode } from '~~/server/generated/prisma/client'

const { data, refresh } = await useFetch('/api/settings/automation', {
  transform: (res: { data: { current: Record<string, ApprovalMode> } }) => res.data,
})
</script>

<template>
  <SettingsShell>
    <!-- Not keyed on `current`: a re-key would remount the form and wipe the
         "Saved." line, which the source kept visible after `revalidatePath`. -->
    <SettingsAutomationForm v-if="data" :current="data.current" @saved="refresh()" />
  </SettingsShell>
</template>
