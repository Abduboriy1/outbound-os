// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    ignores: [
      '.nuxt/**',
      '.output/**',
      'dist/**',
      // Emitted by `prisma generate`, not hand-written.
      'server/generated/**',
    ],
  },
  {
    // `server/lib/**` is a verbatim port of the Next app's `src/lib/**`, which
    // was linted under eslint-config-next. Two of its rules have no counterpart
    // there and would force edits to logic that is meant to stay identical:
    //
    //   no-irregular-whitespace — `research/search/text.ts` matches non-breaking
    //     spaces on purpose while extracting text from HTML.
    //   no-useless-assignment   — the retry loop in `ai/providers/anthropic.ts`
    //     seeds its accumulators before the loop for readability.
    //
    // Anything newly written under server/ is linted normally.
    files: ['server/lib/**/*.ts'],
    rules: {
      'no-irregular-whitespace': 'off',
      'no-useless-assignment': 'off',
    },
  },
)
