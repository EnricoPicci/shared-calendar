import { defineConfig } from 'vitest/config';

// The contract both the API and the browser rely on: kept at 100 % line coverage.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'html'],
      thresholds: { lines: 100 },
    },
  },
});
