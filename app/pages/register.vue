<script setup lang="ts">
/**
 * Port of `src/app/(auth)/register/page.tsx`.
 *
 * Same shape as `login.vue`: `useActionState(registerAction)` becomes a POST to
 * `/api/auth/register` via `useSession().register()`. The endpoint keeps the
 * source's zod rules ("Name is required", "Enter a valid email address",
 * "Password must be at least 8 characters") and its 409 "An account with that
 * email already exists", so every message the form can show is unchanged.
 */
definePageMeta({ layout: 'auth' })

const { register } = useSession()

const name = ref('')
const email = ref('')
const password = ref('')
const error = ref<string | undefined>()
const pending = ref(false)

async function onSubmit() {
  if (pending.value) return
  pending.value = true
  error.value = undefined

  try {
    await register({ name: name.value, email: email.value, password: password.value })
    await navigateTo('/')
  }
  catch (e) {
    const err = e as { data?: { error?: string } }
    error.value = err.data?.error ?? 'Something went wrong'
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <UiCard class="w-full max-w-sm">
    <UiCardBody class="space-y-4">
      <div>
        <h1 class="text-lg font-semibold">
          Create your workspace
        </h1>
        <p class="text-sm text-muted">
          This app is single-tenant by design — one workspace per operator.
        </p>
      </div>
      <form class="space-y-3" @submit.prevent="onSubmit">
        <UiField label="Name">
          <UiInput v-model="name" name="name" required />
        </UiField>
        <UiField label="Email">
          <UiInput
            v-model="email"
            name="email"
            type="email"
            autocomplete="email"
            required
          />
        </UiField>
        <UiField label="Password" hint="At least 8 characters.">
          <UiInput
            v-model="password"
            name="password"
            type="password"
            autocomplete="new-password"
            required
          />
        </UiField>
        <p v-if="error" class="text-xs text-danger">
          {{ error }}
        </p>
        <UiButton
          type="submit"
          variant="primary"
          class="w-full"
          :disabled="pending"
        >
          {{ pending ? 'Creating…' : 'Create account' }}
        </UiButton>
      </form>
      <p class="text-xs text-muted">
        Already registered?
        <NuxtLink to="/login" class="text-accent">
          Sign in
        </NuxtLink>
      </p>
    </UiCardBody>
  </UiCard>
</template>
