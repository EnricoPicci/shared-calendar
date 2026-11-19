import { defineConfig } from 'vitest/config';

// The integration tests need the local stack of the back end (cognito-local on 9229, the API on
// 3000), so they only run when RUN_INTEGRATION=1 is set.
const runIntegration = process.env.RUN_INTEGRATION === '1';

export default defineConfig({
  test: {
    // Without RUN_INTEGRATION the integration project selects no files; that is not a failure.
    passWithNoTests: !runIntegration,
    // All of frontend/src stays at 100 % line coverage: the services (docs/FRONTEND_SERVICES.md
    // section 2, rule 8) and the views (docs/FRONTEND_ARCHITECTURE.md section 12.3).
    // The one file left out is the bundle's entry: one statement, which needs the three constants
    // that only the bundle command defines.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts'],
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
          exclude: ['tests/unit/views/**'],
        },
      },
      {
        // The views' tests need a document (docs/FRONTEND_ARCHITECTURE.md section 8): happy-dom
        // emulates one. The services' tests stay in node, where a DOM global is an error.
        test: {
          name: 'views',
          globals: true,
          environment: 'happy-dom',
          include: ['tests/unit/views/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          globals: true,
          environment: 'node',
          include: runIntegration ? ['tests/integration/**/*.test.ts'] : [],
          // One file at a time: every file shares one sam local, one DynamoDB Local and one cognito-local.
          fileParallelism: false,
          // sam local starts a Lambda container on the first call of each function.
          testTimeout: 60_000,
        },
      },
    ],
  },
});
