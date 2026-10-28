import { defineConfig } from 'vitest/config';

// Integration tests need the local Docker stack (architecture section 8),
// so they only run when RUN_INTEGRATION=1 is set.
const runIntegration = process.env.RUN_INTEGRATION === '1';

export default defineConfig({
  test: {
    // Without RUN_INTEGRATION the integration project selects no files; that is not a failure.
    passWithNoTests: !runIntegration,
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
        },
      },
    ],
  },
});
