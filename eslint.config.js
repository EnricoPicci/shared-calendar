import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/', '.aws-sam/', 'dist/', 'coverage/'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // A leading underscore marks a parameter that is deliberately unused.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
