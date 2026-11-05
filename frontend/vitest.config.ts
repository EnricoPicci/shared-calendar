import { defineConfig } from 'vitest/config';

// The integration tests need the local stack of the back end (cognito-local on 9229, the API on
// 3000), so they only run when RUN_INTEGRATION=1 is set.
const runIntegration = process.env.RUN_INTEGRATION === '1';

export default defineConfig({
  test: {
    // Without RUN_INTEGRATION the integration project selects no files; that is not a failure.
    passWithNoTests: !runIntegration,
    // docs/FRONTEND_SERVICES.md rule 8: the services layer stays at 100 % line coverage.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'html'],
      thresholds: { lines: 100 },
    },
    projects: [
      {
        test: {
          name: 'unit',
          globals: true,
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          globals: true,
          environment: 'node',
          include: runIntegration ? ['tests/integration/**/*.test.ts'] : [],
          // sam local starts a Lambda container on the first call of each function.
          testTimeout: 60_000,
        },
      },
    ],
  },
});
