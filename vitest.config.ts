import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  test: {
    // happy-dom is lighter than jsdom and enough for @vue/test-utils mounts.
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'server/**/*.test.ts',
      'shared/**/*.test.ts',
      'app/**/*.test.ts',
      'app/**/*.test.tsx',
    ],
  },
  resolve: {
    alias: {
      '~~': path.resolve(root),
      '@@': path.resolve(root),
      '~': path.resolve(root, 'app'),
      '@': path.resolve(root, 'app'),
      '#shared': path.resolve(root, 'shared'),
    },
  },
})
