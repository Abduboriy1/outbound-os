<script setup lang="ts">
/** Port of the private `Actions` component in `src/components/leads/forms.tsx`. */
defineProps<{
  pending: boolean;
  label: string;
  cancelHref?: string;
}>();
</script>

<template>
  <div class="flex items-center gap-2 pt-1">
    <UiButton type="submit" variant="primary" :disabled="pending">
      {{ pending ? "Saving..." : label }}
    </UiButton>
    <NuxtLink
      v-if="cancelHref"
      :to="cancelHref"
      class="text-xs text-muted hover:text-foreground"
    >
      Cancel
    </NuxtLink>
  </div>
</template>
