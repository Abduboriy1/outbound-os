import tailwindcss from '@tailwindcss/vite'
import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

/**
 * Ported from the Next app's `next.config.ts` (empty) plus the root-layout
 * concerns of `src/app/layout.tsx`: `<html lang>`/class, the body class, and
 * the document title/description metadata.
 */

/**
 * PrimeVue runs in **styled** mode on an Aura preset whose semantic tokens are
 * re-pointed at the design tokens the React app already used
 * (`--accent`, `--surface`, `--border`, ...). Those CSS variables flip inside a
 * `prefers-color-scheme: dark` media query in `app/assets/css/main.css`, so a
 * single mapping covers both colour schemes and PrimeVue follows the theme for
 * free. See MIGRATION.md for why styled mode was chosen over unstyled + a
 * hand-written Tailwind passthrough preset.
 */
const SalesEnginePreset = definePreset(Aura, {
  primitive: {
    borderRadius: {
      none: '0',
      xs: '2px',
      sm: '4px',
      md: '6px',
      lg: '8px',
      xl: '12px',
    },
  },
  semantic: {
    primary: {
      50: 'var(--accent-soft)',
      100: 'var(--accent-soft)',
      200: 'var(--accent-soft)',
      300: 'var(--accent)',
      400: 'var(--accent)',
      500: 'var(--accent)',
      600: 'var(--accent)',
      700: 'var(--accent)',
      800: 'var(--accent)',
      900: 'var(--accent)',
      950: 'var(--accent)',
    },
    formField: {
      paddingX: '0.75rem',
      paddingY: '0.5rem',
      borderRadius: '6px',
      focusRing: { width: '0', style: 'none', color: 'transparent', offset: '0' },
    },
    colorScheme: {
      light: {
        primary: {
          color: 'var(--accent)',
          contrastColor: '#ffffff',
          hoverColor: 'var(--accent)',
          activeColor: 'var(--accent)',
        },
        surface: {
          0: 'var(--surface)',
          50: 'var(--surface-muted)',
          100: 'var(--surface-muted)',
          200: 'var(--border)',
          300: 'var(--border)',
          400: 'var(--muted)',
          500: 'var(--muted)',
          600: 'var(--muted)',
          700: 'var(--foreground)',
          800: 'var(--foreground)',
          900: 'var(--foreground)',
          950: 'var(--foreground)',
        },
        content: {
          background: 'var(--surface)',
          hoverBackground: 'var(--surface-muted)',
          borderColor: 'var(--border)',
          color: 'var(--foreground)',
          hoverColor: 'var(--foreground)',
        },
        overlay: {
          select: { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--foreground)' },
          popover: { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--foreground)' },
          modal: { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--foreground)' },
        },
        text: {
          color: 'var(--foreground)',
          hoverColor: 'var(--foreground)',
          mutedColor: 'var(--muted)',
          hoverMutedColor: 'var(--foreground)',
        },
        formField: {
          background: 'var(--surface)',
          disabledBackground: 'var(--surface-muted)',
          filledBackground: 'var(--surface-muted)',
          borderColor: 'var(--border)',
          hoverBorderColor: 'var(--border)',
          focusBorderColor: 'var(--accent)',
          invalidBorderColor: 'var(--danger)',
          color: 'var(--foreground)',
          disabledColor: 'var(--muted)',
          placeholderColor: 'var(--muted)',
          invalidPlaceholderColor: 'var(--danger)',
          floatLabelColor: 'var(--muted)',
          iconColor: 'var(--muted)',
          shadow: 'none',
        },
      },
      dark: {
        primary: {
          color: 'var(--accent)',
          contrastColor: '#ffffff',
          hoverColor: 'var(--accent)',
          activeColor: 'var(--accent)',
        },
        surface: {
          0: 'var(--surface)',
          50: 'var(--surface-muted)',
          100: 'var(--surface-muted)',
          200: 'var(--border)',
          300: 'var(--border)',
          400: 'var(--muted)',
          500: 'var(--muted)',
          600: 'var(--muted)',
          700: 'var(--foreground)',
          800: 'var(--foreground)',
          900: 'var(--foreground)',
          950: 'var(--foreground)',
        },
        content: {
          background: 'var(--surface)',
          hoverBackground: 'var(--surface-muted)',
          borderColor: 'var(--border)',
          color: 'var(--foreground)',
          hoverColor: 'var(--foreground)',
        },
        overlay: {
          select: { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--foreground)' },
          popover: { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--foreground)' },
          modal: { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--foreground)' },
        },
        text: {
          color: 'var(--foreground)',
          hoverColor: 'var(--foreground)',
          mutedColor: 'var(--muted)',
          hoverMutedColor: 'var(--foreground)',
        },
        formField: {
          background: 'var(--surface)',
          disabledBackground: 'var(--surface-muted)',
          filledBackground: 'var(--surface-muted)',
          borderColor: 'var(--border)',
          hoverBorderColor: 'var(--border)',
          focusBorderColor: 'var(--accent)',
          invalidBorderColor: 'var(--danger)',
          color: 'var(--foreground)',
          disabledColor: 'var(--muted)',
          placeholderColor: 'var(--muted)',
          invalidPlaceholderColor: 'var(--danger)',
          floatLabelColor: 'var(--muted)',
          iconColor: 'var(--muted)',
          shadow: 'none',
        },
      },
    },
  },
})

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@primevue/nuxt-module', '@pinia/nuxt', '@nuxt/eslint'],

  css: ['~/assets/css/main.css'],

  /**
   * Tailwind v4, CSS-first, exactly as in the Next app — same `@import
   * "tailwindcss"`, same `@theme inline` token block, no JS config file.
   *
   * The one deviation from the source is the plugin host: Next ran Tailwind
   * through `@tailwindcss/postcss`, but Vite resolves CSS `@import` itself
   * before PostCSS sees the file, so `@import "tailwindcss"` fails there.
   * `@tailwindcss/vite` is the supported Vite entry point and produces the
   * same output.
   */
  vite: {
    plugins: [tailwindcss()],
  },

  primevue: {
    options: {
      ripple: false,
      theme: {
        preset: SalesEnginePreset,
        options: {
          // The React app themed itself off `prefers-color-scheme`; keep that.
          darkModeSelector: 'system',
          // Tailwind utilities must be able to beat PrimeVue's own rules, so
          // PrimeVue is confined to a layer declared before `utilities`.
          cssLayer: {
            name: 'primeui',
            order: 'theme, base, primeui, components, utilities',
          },
        },
      },
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'en', class: 'h-full antialiased' },
      bodyAttrs: { class: 'min-h-full' },
      title: 'AI Sales Engine',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            'Research, prioritise, and work outbound leads with AI assistance under human approval.',
        },
      ],
      link: [{ rel: 'icon', href: '/favicon.ico' }],
    },
  },

  typescript: {
    typeCheck: false,
    strict: true,
    tsConfig: {
      compilerOptions: {
        // Nuxt turns both of these on by default; the Next app's tsconfig did
        // not. The ~100 framework-agnostic library files under server/lib were
        // written and type-checked against plain `strict`, so relaxing these
        // two keeps the port a port instead of a rewrite. Application code is
        // still fully strict in every other respect.
        noUncheckedIndexedAccess: false,
        noImplicitOverride: false,
      },
    },
  },

  nitro: {
    // Prisma 7 ships a WASM query compiler; keep it external so Nitro does not
    // try to bundle the engine into the server build.
    externals: {
      external: ['@prisma/client', '@prisma/adapter-pg'],
    },
    // Nitro generates its own tsconfig, so the two relaxations above have to be
    // repeated for the server side — which is where all the ported code lives.
    typescript: {
      tsConfig: {
        compilerOptions: {
          noUncheckedIndexedAccess: false,
          noImplicitOverride: false,
        },
      },
    },
  },

  eslint: {
    config: {
      stylistic: false,
    },
  },
})
