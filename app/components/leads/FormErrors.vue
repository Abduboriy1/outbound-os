<script setup lang="ts">
/** Port of the private `Errors` component in `src/components/leads/forms.tsx`. */
import type { FormState } from "./types";

defineProps<{ state?: FormState }>();
</script>

<template>
  <p v-if="state?.error" role="alert" class="text-xs text-danger">{{ state.error }}</p>
</template>
