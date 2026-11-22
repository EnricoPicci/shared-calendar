import { claudeWiringProblem, FAKE_CLAUDE_BASE_URL, FAKE_CLAUDE_KEY } from '../../integration/claude';

// The check that keeps the assistant's journeys away from the real Claude
// (docs/FRONTEND_SERVICES.md section 14.7), tried here on parameters written by hand: no file is
// read, no stack is needed and no request is made. A key that looks real stands for the real one.

const LOOKS_REAL = 'sk-ant-looks-like-a-real-key';

describe('claudeWiringProblem', () => {
  it('the fake Claude wired, as local:up writes it without a key in its shell: no problem', () => {
    expect(claudeWiringProblem({ ANTHROPIC_BASE_URL: FAKE_CLAUDE_BASE_URL, ANTHROPIC_API_KEY: FAKE_CLAUDE_KEY, COGNITO_ENDPOINT: 'x' })).toBeNull();
  });

  it.each<[string, Record<string, unknown> | undefined]>([
    ['the real Claude: a key and no address', { ANTHROPIC_API_KEY: LOOKS_REAL }],
    ['a key with the address of the fake', { ANTHROPIC_BASE_URL: FAKE_CLAUDE_BASE_URL, ANTHROPIC_API_KEY: LOOKS_REAL }],
    ['another address', { ANTHROPIC_BASE_URL: 'https://api.anthropic.com', ANTHROPIC_API_KEY: FAKE_CLAUDE_KEY }],
    ['an empty address', { ANTHROPIC_BASE_URL: '', ANTHROPIC_API_KEY: FAKE_CLAUDE_KEY }],
    ['neither variable', {}],
    ['no parameters at all', undefined],
  ])('%s: refused, with what to run, and without the key in the message', (_name, parameters) => {
    const problem = claudeWiringProblem(parameters);
    expect(problem).toContain('does not wire the fake Claude');
    expect(problem).toContain('npm run local:up -w backend');
    expect(problem).toContain('restart npm run local:api -w backend');
    expect(problem).not.toContain(LOOKS_REAL);
  });
});
