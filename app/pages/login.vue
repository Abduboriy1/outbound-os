<script setup lang="ts">
/**
 * Port of `src/app/(auth)/login/page.tsx`.
 *
 * React's `useActionState(loginAction)` had three moving parts — the pending
 * flag, the returned `{ error }` state and the action's `redirect("/")`. Server
 * actions have no Nuxt equivalent (MIGRATION.md §2.3), so the form posts to
 * `/api/auth/login` through `useSession().login()` instead. The endpoint carries
 * the same zod rules and the same deliberately identical failure message, so the
 * error strings the user sees are unchanged; `pending` and the redirect are now
 * held here rather than by the framework.
 *
 * The centring wrapper the source repeated at the top of this page lives in the
 * `auth` layout.
 */
definePageMeta({ layout: 'auth' })

const { login } = useSession()

const email = ref('')
const password = ref('')
const error = ref<string | undefined>()
const pending = ref(false)

async function onSubmit() {
  if (pending.value) return
  pending.value = true
  error.value = undefined

  try {
    await login(email.value, password.value)
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
          AI Sales Engine
        </h1>
        <p class="text-sm text-muted">
          Sign in to your workspace.
        </p>
      </div>
      <form class="space-y-3" @submit.prevent="onSubmit">
        <UiField label="Email">
          <UiInput
            v-model="email"
            name="email"
            type="email"
            autocomplete="email"
            required
          />
        </UiField>
        <UiField label="Password">
          <UiInput
            v-model="password"
            name="password"
            type="password"
            autocomplete="current-password"
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
          {{ pending ? 'Signing in…' : 'Sign in' }}
        </UiButton>
      </form>
      <p class="text-xs text-muted">
        No account yet?
        <NuxtLink to="/register" class="text-accent">
          Create one
        </NuxtLink>
      </p>
    </UiCardBody>
  </UiCard>
</template>
