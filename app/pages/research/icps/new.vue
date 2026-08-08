<script setup lang="ts">
/**
 * Port of `src/app/(app)/research/icps/new/page.tsx`.
 *
 * `requireUser()` has no page-level equivalent: `app/middleware/auth.global.ts`
 * already guards every authed route (MIGRATION.md §4.4).
 */
import IcpEditor from "~/components/research/IcpEditor.vue";
import { EMPTY_ICP } from "~/components/research/icp";
</script>

<template>
  <div>
    <UiPageHeader
      title="New ideal customer profile"
      description="Describe who you sell to. The interview can propose a draft you then edit."
    />
    <IcpEditor mode="create" :initial="EMPTY_ICP" />
  </div>
</template>
