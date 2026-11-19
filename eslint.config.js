import tseslint from 'typescript-eslint';
import docReferences from './scripts/eslint-doc-references.mjs';

const NODE_GLOBALS = ['process', 'Buffer', 'global', 'require', '__dirname', '__filename'].map((name) => ({
  name,
  message: 'Node global: frontend/src runs in the browser.',
}));

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
    // The comment rule of CLAUDE.md ("Comments"): a reference names its document; no history tags.
    plugins: { local: docReferences },
    rules: { 'local/doc-references': 'error' },
  },
  {
    // The front end's code runs in the browser (docs/FRONTEND_SERVICES.md section 2, rule 2). The
    // compiler cannot stop a Node import here: vitest's type declarations pull in @types/node.
    // So: only rxjs, @shared-calendar/shared and relative imports, and no Node globals. The
    // scripts under frontend/scripts/ run in Node and are not matched.
    files: ['frontend/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          regex: '^(?!(rxjs|rxjs/fetch|rxjs/operators|@shared-calendar/shared|\\.{1,2}/.*)$)',
          message: 'frontend/src imports only rxjs, rxjs/fetch, rxjs/operators, @shared-calendar/shared and relative paths.',
        }],
      }],
      'no-restricted-globals': ['error', ...NODE_GLOBALS],
      // Text reaches the page through textContent only: a username or a note is typed by one
      // person and shown to another (docs/FRONTEND_ARCHITECTURE.md section 3, rule 5).
      'no-restricted-syntax': ['error', {
        selector: 'MemberExpression[property.name=/^(innerHTML|outerHTML|insertAdjacentHTML)$/], MemberExpression[property.value=/^(innerHTML|outerHTML|insertAdjacentHTML)$/]',
        message: 'No innerHTML, outerHTML or insertAdjacentHTML in frontend/src: text goes in through textContent.',
      }],
    },
  },
  {
    // The services and the logic layer never touch the DOM (docs/FRONTEND_ARCHITECTURE.md
    // section 2): no global document or window there. A parameter or a variable with one of these
    // names is not the global and is allowed. This block's list replaces the one above for these
    // files, so it repeats the Node globals.
    files: ['frontend/src/services/**/*.ts', 'frontend/src/logic/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error',
        ...NODE_GLOBALS,
        ...['document', 'window'].map((name) => ({
          name,
          message: 'DOM global: the services and the logic layer have no DOM; only the views and the shell do.',
        })),
      ],
    },
  },
);
