import tseslint from 'typescript-eslint';

export default tseslint.config(
  // '**/' so that the patterns apply inside every package (backend/, shared/), not only at the root.
  { ignores: ['**/node_modules/', '**/.aws-sam/', '**/dist/', '**/coverage/'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // A leading underscore marks a parameter that is deliberately unused.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The front end's services run in the browser (docs/FRONTEND_SERVICES.md rule 2). The compiler
    // cannot stop a Node import here: vitest's type declarations pull in @types/node. So: only
    // rxjs, @shared-calendar/shared and relative imports, and no Node globals.
    files: ['frontend/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          regex: '^(?!(rxjs|rxjs/fetch|rxjs/operators|@shared-calendar/shared|\\.{1,2}/.*)$)',
          message: 'frontend/src imports only rxjs, rxjs/fetch, rxjs/operators, @shared-calendar/shared and relative paths.',
        }],
      }],
      'no-restricted-globals': ['error',
        ...['process', 'Buffer', 'global', 'require', '__dirname', '__filename'].map((name) => ({
          name,
          message: 'Node global: frontend/src runs in the browser.',
        })),
      ],
    },
  },
);
