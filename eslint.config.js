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
    // The Anthropic SDK is imported by one module only, backend/src/lib/anthropic.ts, the one door
    // to Claude (docs/CONVERSATIONAL_ARCHITECTURE.md section 7.2), and by that module's unit test,
    // which replaces the SDK's sending method. Everything else asks Claude through the module.
    // This block comes before the front end's: for frontend/src the stricter list below applies.
    files: ['**/*.ts', '**/*.js', '**/*.mjs'],
    ignores: ['backend/src/lib/anthropic.ts', 'backend/tests/unit/lib/anthropic.test.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          regex: '^@anthropic-ai/sdk(/.*)?$',
          message: 'The Anthropic SDK is imported only by backend/src/lib/anthropic.ts: ask Claude through that module.',
        }],
      }],
    },
  },
  {
    // The assistant's core reaches the calendar through a route's handler only, so that every
    // rule of the calendar stays in one place (docs/CONVERSATIONAL_ARCHITECTURE.md section 8.1):
    // it imports neither the module that knows the calendar table nor the two that hold the
    // calendar's checks and events. A block that sets this rule replaces the one above for the
    // files it matches, so the Anthropic SDK is refused here again.
    files: ['backend/src/assistant/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            regex: '^@anthropic-ai/sdk(/.*)?$',
            message: 'The Anthropic SDK is imported only by backend/src/lib/anthropic.ts: ask Claude through that module.',
          },
          {
            regex: '(^|/)lib/(calendarDb|calendarRules|calendarEvents)(\\.[jt]s)?$',
            message: "The assistant's core reaches the calendar through a route's handler (backend/src/handlers), never through the calendar's own modules.",
          },
          {
            regex: '(^|/)handlers/(bookAppointment|cancelAppointment|changeAppointment|updateAppointmentNote|createAvailabilityType|renameAvailabilityType|deleteAvailabilityType|createPattern|updatePattern|deletePattern|setOverride|deleteOverride|createOneOffWindow|deleteOneOffWindow|updateCalendarSettings|createUser|deleteUser)(\\.[jt]s)?$',
            message: "A handler that changes the calendar is imported only by backend/src/assistant/tools/changeHandlers.ts: no function that reads free text or asks Claude may carry it.",
          },
          {
            regex: '(^|/)changeHandlers(\\.[jt]s)?$',
            message: 'The handlers that change the calendar are reached only from backend/src/assistant/confirm.ts, the confirmation of a proposal.',
          },
          {
            regex: '(^|/)confirm(\\.[jt]s)?$',
            message: 'The confirmation of a proposal is imported only by its handler, backend/src/handlers/confirmProposal.ts.',
          },
        ],
      }],
    },
  },
  {
    // No request of Claude and no text anybody typed runs a change
    // (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5, rule 1): the handlers of the routes that
    // change the calendar are imported by one module of the assistant, changeHandlers.ts, and
    // that module by one other, confirm.ts, which only the handler of the confirmation imports.
    // The rule above refuses both imports everywhere else in the assistant; these two blocks
    // open each of the two doors and repeat the rest, since a block that sets the rule replaces
    // the ones before it.
    files: ['backend/src/assistant/tools/changeHandlers.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
          {
            regex: '^@anthropic-ai/sdk(/.*)?$',
            message: 'The Anthropic SDK is imported only by backend/src/lib/anthropic.ts: ask Claude through that module.',
          },
          {
            regex: '(^|/)lib/(calendarDb|calendarRules|calendarEvents)(\\.[jt]s)?$',
            message: "The assistant's core reaches the calendar through a route's handler (backend/src/handlers), never through the calendar's own modules.",
          },
      ] }],
    },
  },
  {
    files: ['backend/src/assistant/confirm.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
          {
            regex: '^@anthropic-ai/sdk(/.*)?$',
            message: 'The Anthropic SDK is imported only by backend/src/lib/anthropic.ts: ask Claude through that module.',
          },
          {
            regex: '(^|/)lib/(calendarDb|calendarRules|calendarEvents)(\\.[jt]s)?$',
            message: "The assistant's core reaches the calendar through a route's handler (backend/src/handlers), never through the calendar's own modules.",
          },
          {
            regex: '(^|/)handlers/(bookAppointment|cancelAppointment|changeAppointment|updateAppointmentNote|createAvailabilityType|renameAvailabilityType|deleteAvailabilityType|createPattern|updatePattern|deletePattern|setOverride|deleteOverride|createOneOffWindow|deleteOneOffWindow|updateCalendarSettings|createUser|deleteUser)(\\.[jt]s)?$',
            message: "A handler that changes the calendar is imported only by backend/src/assistant/tools/changeHandlers.ts: no function that reads free text or asks Claude may carry it.",
          },
      ] }],
    },
  },
  {
    // The confirmation's core is imported by its handler alone: the other handlers of the
    // assistant, which take free text or ask Claude on their own, must not reach the code that
    // changes the calendar.
    files: ['backend/src/handlers/*.ts'],
    ignores: ['backend/src/handlers/confirmProposal.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
          {
            regex: '^@anthropic-ai/sdk(/.*)?$',
            message: 'The Anthropic SDK is imported only by backend/src/lib/anthropic.ts: ask Claude through that module.',
          },
          {
            regex: '(^|/)assistant/(confirm|tools/changeHandlers)(\\.[jt]s)?$',
            message: 'Only backend/src/handlers/confirmProposal.ts imports the confirmation of a proposal.',
          },
      ] }],
    },
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
