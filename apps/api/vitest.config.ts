import { defineConfig } from 'vitest/config';

// Unit tests for the API's pure domain logic (no DB / network). Run: npm test -w apps/api
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
});
