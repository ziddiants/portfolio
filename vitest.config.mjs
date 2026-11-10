import { defineConfig } from 'vitest/config';

// Vitest runs the verify-rule tests only. The older tests use node:test and keep their own scripts.
export default defineConfig({
  test: {
    include: [
      'tests/verify/**/*.test.mjs',
      'tests/pdf/**/*.test.mjs',
      'tests/content/**/*.test.mjs',
      'tests/assets/**/*.test.mjs',
    ],
    testTimeout: 60_000,
  },
});
