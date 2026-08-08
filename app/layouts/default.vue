<script setup lang="ts">
/**
 * Port of `src/app/(app)/layout.tsx` — the authenticated shell.
 *
 * The Next version was a server component that called `getCurrentUser()` and
 * redirected on a miss. Here the redirect is handled earlier and in two places
 * (`server/middleware/auth.ts` for document loads, `app/middleware/auth.global.ts`
 * for client navigations), so the layout only needs the user's name; it reads
 * it from `useSession()`. The Next sign-out `<form action={logoutAction}>`
 * becomes a POST to `/api/auth/logout` through the same composable.
 *
 * Two additions over the source. The desktop sidebar collapses to the side —
 * the `<aside>` animates to zero width and `inert` takes its links out of the
 * tab order while it is closed, so a collapsed sidebar is not a keyboard trap.
 * And the sidebar was `hidden` below `md` with nothing in its place, so narrow
 * screens now get the same nav in a PrimeVue `Drawer`.
 */
import Drawer from "primevue/drawer";
import { cn } from "~/utils/format";

const { user, logout } = useSession();
const { collapsed, toggle } = useNavCollapsed();

const drawerOpen = ref(false);
</script>

<template>
  <div class="flex min-h-screen">
    <aside
      :inert="collapsed"
      :aria-hidden="collapsed"
      :class="
        cn(
          'hidden shrink-0 flex-col overflow-hidden border-border bg-surface transition-[width] duration-200 ease-out md:flex',
          collapsed ? 'w-0 border-r-0' : 'w-56 border-r',
        )
      "
    >
      <!-- Fixed-width inner column: the width transition happens on the aside,
           so the contents must not reflow line by line while it plays. -->
      <div class="flex w-56 shrink-0 flex-1 flex-col">
        <div class="flex items-start gap-2 border-b border-border px-4 py-3">
          <div class="min-w-0 flex-1">
            <NuxtLink to="/" class="text-sm font-semibold">AI Sales Engine</NuxtLink>
            <p class="mt-0.5 text-xs text-muted">{{ user?.name }}</p>
          </div>
          <UiButton
            variant="ghost"
            size="sm"
            class="-mr-1.5 shrink-0 px-1.5"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            @click="toggle()"
          >
            <svg
              viewBox="0 0 24 24"
              class="size-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18M16 9l-3 3 3 3" />
            </svg>
          </UiButton>
        </div>
        <div class="flex-1 overflow-y-auto p-2">
          <AppNav />
        </div>
        <div class="border-t border-border p-2">
          <button
            class="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted hover:bg-surface-muted"
            @click="logout()"
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>

    <main class="min-w-0 flex-1 p-5 md:p-7">
      <div v-if="collapsed" class="mb-4 hidden md:block">
        <UiButton
          variant="ghost"
          size="sm"
          class="-ml-1.5 px-1.5"
          aria-label="Expand sidebar"
          title="Expand sidebar"
          @click="toggle()"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18M13 9l3 3-3 3" />
          </svg>
        </UiButton>
      </div>

      <div class="mb-4 md:hidden">
        <UiButton
          variant="ghost"
          size="sm"
          class="-ml-1.5 px-1.5"
          aria-label="Open navigation"
          @click="drawerOpen = true"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </UiButton>
      </div>

      <slot />
    </main>

    <Drawer
      v-model:visible="drawerOpen"
      position="left"
      class="w-64"
      :pt="{ content: { class: 'p-2' } }"
    >
      <template #header>
        <div class="min-w-0">
          <span class="text-sm font-semibold">AI Sales Engine</span>
          <p class="mt-0.5 text-xs text-muted">{{ user?.name }}</p>
        </div>
      </template>
      <AppNav @navigate="drawerOpen = false" />
      <template #footer>
        <button
          class="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted hover:bg-surface-muted"
          @click="logout()"
        >
          Sign out
        </button>
      </template>
    </Drawer>
  </div>
</template>
