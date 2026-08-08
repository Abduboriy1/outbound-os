<script setup lang="ts">
/**
 * The `(auth)` route group's shell. Next had no `(auth)/layout.tsx`; the
 * centring wrapper was repeated at the top of `login/page.tsx` and
 * `register/page.tsx`. It is lifted here so both pages are just the card.
 *
 * Pages under /login and /register must opt in with
 * `definePageMeta({ layout: 'auth' })`.
 */
</script>

<template>
  <div class="flex min-h-screen items-center justify-center p-6">
    <slot />
  </div>
</template>
