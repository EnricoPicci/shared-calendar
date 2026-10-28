import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/', '.aws-sam/', 'dist/', 'coverage/'] },
  ...tseslint.configs.recommended,
);
