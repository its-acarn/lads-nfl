import { defineConfig } from 'vitest/config'

// .mts on purpose: the app tsconfig includes **/*.ts, and this file (plus the
// *.test.ts specs, excluded there) must not be type-checked by Next's TS 4.8
// build. Vitest transpiles tests itself via esbuild.
export default defineConfig({
  test: {
    include: ['helpers/draft/**/*.test.ts', 'scripts/**/*.test.ts'],
    watch: false,
  },
})
