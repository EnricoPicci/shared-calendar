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
);
