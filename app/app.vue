<script setup lang="ts">
/**
 * Port of the remainder of `src/app/layout.tsx`. The `<html>`/`<body>` classes
 * and the title/description metadata moved into `nuxt.config.ts` under `app.head`;
 * what is left is the layout host.
 */
</script>

<template>
  <div>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <Toast />
  </div>
</template>
