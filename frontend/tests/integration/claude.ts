import { readFileSync } from 'node:fs';

// Which Claude the local stack is wired to, for the assistant's journeys
// (docs/FRONTEND_SERVICES.md section 14.7). A helper, not a test file. The journeys talk to the
// fake Claude of the Docker stack only (docs/ARCHITECTURE.md section 8): the real one would cost
// money and answer differently at every run. The back end's journeys apply the same rule with a
// check of their own.

const ENV_FILE = new URL('../../../backend/env.local.json', import.meta.url);

// What `npm run local:up -w backend` writes when no key of Anthropic is set in its shell.
export const FAKE_CLAUDE_BASE_URL = 'http://fake-claude:9230';
export const FAKE_CLAUDE_KEY = 'not-a-key-the-fake-claude-checks-none';

// Why the assistant's journeys must not run, or null when the given parameters wire the fake
// Claude: its address, and the placeholder that is plainly not a key. Anything else is refused:
// no address (Anthropic's own is then used), another address, or the fake's address with a real
// key. The message names the two variables and never a value of them.
export function claudeWiringProblem(parameters: Record<string, unknown> | undefined): string | null {
  if (parameters?.ANTHROPIC_BASE_URL === FAKE_CLAUDE_BASE_URL && parameters.ANTHROPIC_API_KEY === FAKE_CLAUDE_KEY) return null;
  return (
    'backend/env.local.json does not wire the fake Claude (ANTHROPIC_BASE_URL and ANTHROPIC_API_KEY under "Parameters"): ' +
    'the journeys never run against the real Claude. Run npm run local:up -w backend in a shell where ANTHROPIC_API_KEY ' +
    'is not set, then restart npm run local:api -w backend (it reads the file only when it starts)'
  );
}

// Throws, before any request, when the local stack is not wired to the fake Claude. The file is
// what `local:api` read when it started.
export function refuseRealClaude(): void {
  const env = JSON.parse(readFileSync(ENV_FILE, 'utf8')) as { Parameters?: Record<string, unknown> };
  const problem = claudeWiringProblem(env.Parameters);
  if (problem !== null) throw new Error(problem);
}
