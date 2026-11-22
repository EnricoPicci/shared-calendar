import Anthropic from '@anthropic-ai/sdk';
import { GetParameterCommand, ParameterNotFound, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import type { ConversationEntry, StepRequest } from '../../../src/lib/anthropic';

// The module reads its configuration once per container and keeps the key, the client and the
// spending limit in memory, so every test imports a fresh copy after setting the environment.
// Nothing reaches a network: the SDK's one method that sends a request is replaced, and so is the
// Parameter Store client.
type Lib = typeof import('../../../src/lib/anthropic');

const ssm = mockClient(SSMClient);
const create = vi.spyOn(Anthropic.Messages.prototype, 'create');

const MODEL = 'claude-sonnet-5-5';
const KEY = 'sk-ant-test-key-from-the-environment';
const STORED_KEY = 'sk-ant-test-key-from-parameter-store';
const KEY_PARAMETER = '/shared-calendar-api/anthropic-api-key';
const NOW = '2026-11-21T09:30:00.000Z';
const MINUTE = 60_000;

const plus = (instant: string, ms: number) => new Date(Date.parse(instant) + ms).toISOString();

type Env = { model?: string; effort?: string; key?: string; keyParameter?: string; baseUrl?: string; budgetMemorySeconds?: string };

async function load(env: Env = {}): Promise<Lib> {
  vi.stubEnv('ASSISTANT_MODEL', env.model ?? MODEL);
  vi.stubEnv('ASSISTANT_EFFORT', env.effort ?? '');
  vi.stubEnv('ANTHROPIC_API_KEY', env.key ?? KEY);
  vi.stubEnv('ANTHROPIC_KEY_PARAMETER', env.keyParameter ?? '');
  vi.stubEnv('ANTHROPIC_BASE_URL', env.baseUrl ?? '');
  vi.stubEnv('ASSISTANT_BUDGET_MEMORY_SECONDS', env.budgetMemorySeconds ?? '');
  vi.resetModules();
  return import('../../../src/lib/anthropic');
}

const USAGE = { input_tokens: 12, output_tokens: 34, cache_read_input_tokens: 5600, cache_creation_input_tokens: 78 };

// A message as Anthropic answers it, cut down to the fields the module reads.
const message = (over: Record<string, unknown> = {}) =>
  ({
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content: [{ type: 'text', text: 'Today is Saturday.', citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: USAGE,
    ...over,
  }) as unknown as Anthropic.Message;

const answers = (over: Record<string, unknown> = {}) => create.mockResolvedValue(message(over) as never);
const languageAnswer = (text: string) => answers({ content: [{ type: 'text', text, citations: null }] });

// An error as the SDK throws it for an answer of Anthropic with this status and body.
const apiError = (status: number, error: Record<string, unknown>) =>
  Anthropic.APIError.generate(status, { type: 'error', error, request_id: 'req_test' }, undefined, new Headers({ 'request-id': 'req_test' }));
const fails = (err: unknown) => create.mockRejectedValue(err as never);

const TIER_CAP = apiError(429, { type: 'rate_limit_error', message: 'You have reached your API usage limits.', details: { error_code: 'enforced_spend_limit_reached' } });

const CONVERSATION: ConversationEntry[] = [
  { role: 'user', content: 'Which slots are free next week?' },
  { role: 'system', content: 'Now: Saturday 21 November 2026, 10:30. Language: English.' },
  { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id: 'toolu_1', name: 'get_calendar', input: { from: '2026-11-23' } }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Free: Tuesday 10:00.' }] },
];
const TOOL = { name: 'get_calendar', description: 'Reads the calendar.', input_schema: { type: 'object' as const, properties: {} } };
const request = (over: Partial<StepRequest> = {}): StepRequest => ({
  tools: [],
  instructions: 'The fixed instructions.',
  context: 'The person: alice, a User.',
  conversation: CONVERSATION,
  ...over,
});

// The body of the n-th request sent, and the client it was sent with.
const sentBody = (n = 0) => create.mock.calls[n]?.[0] as unknown as Record<string, unknown>;
const sentWith = (n = 0) => (create.mock.contexts[n] as unknown as { _client: Anthropic })._client;

beforeEach(() => {
  ssm.reset();
  create.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('askStep: the request as sent (7.2)', () => {
  it('names the model, adaptive thinking at low effort, 8 000 tokens and the two cache marks', async () => {
    const lib = await load();
    answers();

    await lib.askStep(request({ tools: [TOOL] }), NOW);

    expect(create).toHaveBeenCalledTimes(1);
    expect(sentBody()).toEqual({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      cache_control: { type: 'ephemeral' },
      tools: [TOOL],
      system: [
        { type: 'text', text: 'The fixed instructions.', cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'The person: alice, a User.' },
      ],
      messages: CONVERSATION,
    });
  });

  it('sends the conversation untouched: the same entries, not changed by the call', async () => {
    const lib = await load();
    answers();
    const before = structuredClone(CONVERSATION);

    await lib.askStep(request(), NOW);

    expect(sentBody().messages).toBe(CONVERSATION);
    expect(CONVERSATION).toEqual(before);
  });

  it('leaves the tools out of the request when there are none', async () => {
    const lib = await load();
    answers();

    await lib.askStep(request({ tools: [] }), NOW);

    expect(sentBody()).not.toHaveProperty('tools');
  });

  it("makes the client with the key, 22 seconds, no retry, and Anthropic's own address", async () => {
    const lib = await load();
    answers();

    await lib.askStep(request(), NOW);

    expect(sentWith().apiKey).toBe(KEY);
    expect(sentWith().timeout).toBe(22_000);
    expect(sentWith().maxRetries).toBe(0);
    expect(sentWith().baseURL).toBe('https://api.anthropic.com');
  });

  it('uses another address only when ANTHROPIC_BASE_URL is not empty', async () => {
    const lib = await load({ baseUrl: 'http://fake-claude:9230' });
    answers();

    await lib.askStep(request(), NOW);

    expect(sentWith().baseURL).toBe('http://fake-claude:9230');
  });

  it('makes one client and reuses it', async () => {
    const lib = await load();
    answers();

    await lib.askStep(request(), NOW);
    await lib.askLanguage('ciao', NOW);

    expect(sentWith(1)).toBe(sentWith(0));
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('askStep: what comes back (7.4)', () => {
  const COUNTS = { inputTokens: 12, outputTokens: 34, cacheReadTokens: 5600, cacheWriteTokens: 78 };

  it('text: the content as given, its text, the token counts', async () => {
    const lib = await load();
    const content = [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: 'Today is ', citations: null },
      { type: 'text', text: 'Saturday.', citations: null },
    ];
    answers({ content });

    const answer = await lib.askStep(request(), NOW);

    expect(answer).toEqual({ kind: 'text', content, text: 'Today is Saturday.', usage: COUNTS });
    expect(answer.kind === 'text' && answer.content).toBe(content);
  });

  it('text also when a stop sequence ended it', async () => {
    const lib = await load();
    answers({ stop_reason: 'stop_sequence' });

    await expect(lib.askStep(request(), NOW)).resolves.toMatchObject({ kind: 'text', text: 'Today is Saturday.' });
  });

  it('tool requests: the content as given and each request read out of it', async () => {
    const lib = await load();
    const content = [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'tool_use', id: 'toolu_1', name: 'get_calendar', input: { from: '2026-11-23', to: '2026-11-29' }, caller: { type: 'direct' } },
      { type: 'tool_use', id: 'toolu_2', name: 'list_types', input: {}, caller: { type: 'direct' } },
    ];
    answers({ content, stop_reason: 'tool_use' });

    await expect(lib.askStep(request({ tools: [TOOL] }), NOW)).resolves.toEqual({
      kind: 'tool_requests',
      content,
      requests: [
        { id: 'toolu_1', name: 'get_calendar', input: { from: '2026-11-23', to: '2026-11-29' } },
        { id: 'toolu_2', name: 'list_types', input: {} },
      ],
      usage: COUNTS,
    });
  });

  it('cut short: what there is', async () => {
    const lib = await load();
    answers({ stop_reason: 'max_tokens' });

    await expect(lib.askStep(request(), NOW)).resolves.toEqual({
      kind: 'cut_short',
      content: [{ type: 'text', text: 'Today is Saturday.', citations: null }],
      text: 'Today is Saturday.',
      usage: COUNTS,
    });
  });

  it('refusal: nothing to store', async () => {
    const lib = await load();
    answers({ stop_reason: 'refusal', content: [] });

    await expect(lib.askStep(request(), NOW)).resolves.toEqual({ kind: 'refusal', usage: COUNTS });
  });

  it('a way of stopping the design never asks for is unavailable', async () => {
    const lib = await load();
    answers({ stop_reason: 'pause_turn' });

    await expect(lib.askStep(request(), NOW)).resolves.toEqual({ kind: 'unavailable', reason: 'other' });
  });

  it('counts no cached tokens when Anthropic reports none', async () => {
    const lib = await load();
    answers({ usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: null, cache_creation_input_tokens: null } });

    await expect(lib.askStep(request(), NOW)).resolves.toMatchObject({
      usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 },
    });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('each error mapped (6.1, 7.4)', () => {
  const unavailable = [
    ['a time-out', () => new Anthropic.APIConnectionTimeoutError(), 'timeout'],
    ['no connection', () => new Anthropic.APIConnectionError({ message: 'Connection error.' }), 'connection'],
    ['a 500', () => apiError(500, { type: 'api_error', message: 'Internal server error' }), 'other'],
    ["a time-out on Anthropic's side", () => apiError(504, { type: 'timeout_error', message: 'Request timed out' }), 'timeout'],
    ['a 529', () => apiError(529, { type: 'overloaded_error', message: 'Overloaded' }), 'overloaded'],
    ['a 401', () => apiError(401, { type: 'authentication_error', message: 'invalid x-api-key' }), 'key_refused'],
    ['an ordinary 429', () => apiError(429, { type: 'rate_limit_error', message: 'This request would exceed your rate limit.' }), 'rate_limit'],
    ['a 429 of the ramp limit', () => apiError(429, { type: 'rate_limit_error', message: 'ramp', details: { error_code: 'ramp_limit_exceeded' } }), 'rate_limit'],
    ['an ordinary 400', () => apiError(400, { type: 'invalid_request_error', message: 'messages: at least one message is required' }), 'request_refused'],
    ['a 400 that only mentions the limit later', () => apiError(400, { type: 'invalid_request_error', message: 'Wrong: You have reached your specified API usage limits' }), 'request_refused'],
    ['a request the caller aborted', () => new Anthropic.APIUserAbortError(), 'other'],
    ['something that is not an error of the SDK', () => new TypeError('fetch failed'), 'other'],
  ] as const;

  it.each(unavailable)('%s is unavailable', async (_name, error, reason) => {
    const lib = await load();
    fails(error());

    await expect(lib.askStep(request(), NOW)).resolves.toEqual({ kind: 'unavailable', reason });
    await expect(lib.askLanguage('ciao', NOW)).resolves.toEqual({ kind: 'unavailable', reason });
    // Nothing is remembered: Anthropic is asked again each time.
    expect(create).toHaveBeenCalledTimes(2);
  });

  const budget = [
    ["the 429 of the tier's monthly cap", () => TIER_CAP],
    ["the 429 of a contract's limit", () => apiError(429, { type: 'rate_limit_error', message: 'limit', details: { error_code: 'contract_spend_limit_reached' } })],
    ['a 402', () => apiError(402, { type: 'billing_error', message: 'There is an issue with your billing.' })],
    ['the 400 of a limit the owner set', () => apiError(400, { type: 'invalid_request_error', message: 'You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.' })],
    ['the 400 of a workspace limit', () => apiError(400, { type: 'invalid_request_error', message: 'You have reached your specified workspace API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.' })],
  ] as const;

  it.each(budget)('%s is budget reached', async (_name, error) => {
    const lib = await load();
    fails(error());

    await expect(lib.askStep(request(), NOW)).resolves.toEqual({ kind: 'budget_reached' });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('the ten minutes of the spending limit (6.1)', () => {
  it('answers budget reached without asking Anthropic, both functions alike, until ten minutes are over', async () => {
    const lib = await load();
    fails(TIER_CAP);
    await expect(lib.askStep(request(), NOW)).resolves.toEqual({ kind: 'budget_reached' });
    expect(create).toHaveBeenCalledTimes(1);
    answers();

    const oneSecondBefore = plus(NOW, 10 * MINUTE - 1000);
    await expect(lib.askStep(request(), oneSecondBefore)).resolves.toEqual({ kind: 'budget_reached' });
    await expect(lib.askLanguage('ciao', oneSecondBefore)).resolves.toEqual({ kind: 'budget_reached' });
    expect(create).toHaveBeenCalledTimes(1);

    const oneSecondAfter = plus(NOW, 10 * MINUTE + 1000);
    await expect(lib.askStep(request(), oneSecondAfter)).resolves.toMatchObject({ kind: 'text' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('seen by the language question, it binds a step too', async () => {
    const lib = await load();
    fails(TIER_CAP);
    await expect(lib.askLanguage('ciao', NOW)).resolves.toEqual({ kind: 'budget_reached' });
    answers();

    await expect(lib.askStep(request(), plus(NOW, MINUTE))).resolves.toEqual({ kind: 'budget_reached' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('lasts the seconds of ASSISTANT_BUDGET_MEMORY_SECONDS when the local stack sets them: with 0, Anthropic is asked again at once', async () => {
    const lib = await load({ budgetMemorySeconds: '0' });
    fails(TIER_CAP);
    expect(await lib.askStep(request(), NOW)).toEqual({ kind: 'budget_reached' });

    answers();
    expect((await lib.askStep(request(), NOW)).kind).toBe('text');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it.each(['-1', '1.5', 'soon'])('refuses ASSISTANT_BUDGET_MEMORY_SECONDS = %s as a broken deployment', async (budgetMemorySeconds) => {
    const lib = await load({ budgetMemorySeconds });
    await expect(lib.askStep(request(), NOW)).rejects.toMatchObject({ name: 'AnthropicConfigError' });
    expect(create).not.toHaveBeenCalled();
  });

  it('does not read the key while it lasts', async () => {
    const lib = await load({ key: '', keyParameter: KEY_PARAMETER });
    ssm.on(GetParameterCommand).resolves({ Parameter: { Value: STORED_KEY } });
    fails(TIER_CAP);
    await lib.askStep(request(), NOW);

    await lib.askStep(request(), plus(NOW, 11 * MINUTE - 2 * MINUTE));

    expect(ssm.commandCalls(GetParameterCommand)).toHaveLength(1);
  });
});

describe('the key', () => {
  it('comes from ANTHROPIC_API_KEY when it is set, and Parameter Store is not read', async () => {
    const lib = await load({ key: KEY, keyParameter: KEY_PARAMETER });
    answers();

    await lib.askStep(request(), NOW);

    expect(sentWith().apiKey).toBe(KEY);
    expect(ssm.commandCalls(GetParameterCommand)).toHaveLength(0);
  });

  it('comes from Parameter Store when the variable is empty, read with decryption', async () => {
    const lib = await load({ key: '', keyParameter: KEY_PARAMETER });
    ssm.on(GetParameterCommand).resolves({ Parameter: { Value: STORED_KEY } });
    answers();

    await lib.askStep(request(), NOW);

    expect(sentWith().apiKey).toBe(STORED_KEY);
    expect(ssm.commandCalls(GetParameterCommand)[0]?.args[0].input).toEqual({ Name: KEY_PARAMETER, WithDecryption: true });
  });

  it('is kept ten minutes, then read again', async () => {
    const lib = await load({ key: '', keyParameter: KEY_PARAMETER });
    ssm.on(GetParameterCommand).resolvesOnce({ Parameter: { Value: STORED_KEY } }).resolves({ Parameter: { Value: 'sk-ant-test-rotated' } });
    answers();

    await lib.askStep(request(), NOW);
    await lib.askStep(request(), plus(NOW, 10 * MINUTE - 1000));
    expect(ssm.commandCalls(GetParameterCommand)).toHaveLength(1);
    expect(sentWith(1).apiKey).toBe(STORED_KEY);

    await lib.askStep(request(), plus(NOW, 10 * MINUTE + 1000));
    expect(ssm.commandCalls(GetParameterCommand)).toHaveLength(2);
    expect(sentWith(2).apiKey).toBe('sk-ant-test-rotated');
    expect(sentWith(2)).not.toBe(sentWith(0));
  });

  it('is dropped after a 401, so that a rotated key is read at the next request', async () => {
    const lib = await load({ key: '', keyParameter: KEY_PARAMETER });
    ssm.on(GetParameterCommand).resolvesOnce({ Parameter: { Value: STORED_KEY } }).resolves({ Parameter: { Value: 'sk-ant-test-rotated' } });
    fails(apiError(401, { type: 'authentication_error', message: 'invalid x-api-key' }));
    await expect(lib.askStep(request(), NOW)).resolves.toEqual({ kind: 'unavailable', reason: 'key_refused' });
    answers();

    await expect(lib.askStep(request(), plus(NOW, 1000))).resolves.toMatchObject({ kind: 'text' });

    expect(ssm.commandCalls(GetParameterCommand)).toHaveLength(2);
    expect(sentWith(1).apiKey).toBe('sk-ant-test-rotated');
  });

  const missing = [
    ['neither the variable nor the parameter name is set', { key: '', keyParameter: '' }, () => undefined],
    ['the parameter does not exist', { key: '', keyParameter: KEY_PARAMETER }, () => ssm.on(GetParameterCommand).rejects(new ParameterNotFound({ message: 'not found', $metadata: {} }))],
    ['the parameter is empty', { key: '', keyParameter: KEY_PARAMETER }, () => ssm.on(GetParameterCommand).resolves({ Parameter: { Value: '' } })],
    ['the read is refused', { key: '', keyParameter: KEY_PARAMETER }, () => ssm.on(GetParameterCommand).rejects(Object.assign(new Error('not authorized'), { name: 'AccessDeniedException' }))],
  ] as const;

  it.each(missing)('missing (%s): unavailable, Anthropic not asked, no exception', async (_name, env, prepare) => {
    const lib = await load(env);
    prepare();

    await expect(lib.askStep(request(), NOW)).resolves.toEqual({ kind: 'unavailable', reason: 'key_missing' });
    await expect(lib.askLanguage('ciao', NOW)).resolves.toEqual({ kind: 'unavailable', reason: 'key_missing' });
    expect(create).not.toHaveBeenCalled();
  });

  it('missing is not remembered: the next request reads the parameter again', async () => {
    const lib = await load({ key: '', keyParameter: KEY_PARAMETER });
    ssm.on(GetParameterCommand).rejectsOnce(new ParameterNotFound({ message: 'not found', $metadata: {} })).resolves({ Parameter: { Value: STORED_KEY } });
    answers();
    await expect(lib.askStep(request(), NOW)).resolves.toMatchObject({ kind: 'unavailable' });

    await expect(lib.askStep(request(), plus(NOW, 1000))).resolves.toMatchObject({ kind: 'text' });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('askLanguage (4.2)', () => {
  it('asks one question whose answer is constrained to the supported languages', async () => {
    const lib = await load();
    languageAnswer('{"language":"it"}');

    await lib.askLanguage('Quali appuntamenti ho?', NOW);

    const body = sentBody();
    expect(body).toMatchObject({
      model: MODEL,
      max_tokens: 2000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: { type: 'object', properties: { language: { type: 'string', enum: ['en', 'it'] } }, required: ['language'], additionalProperties: false },
        },
      },
      messages: [{ role: 'user', content: 'Quali appuntamenti ho?' }],
    });
    expect(body.system).toContain('en, it');
    expect(body).not.toHaveProperty('tools');
  });

  it.each([
    ['{"language":"en"}', 'en'],
    ['{"language":"it"}', 'it'],
    ['{"language": "it"}', 'it'],
  ])('reads %s as %s, with the token counts', async (text, language) => {
    const lib = await load();
    languageAnswer(text);

    await expect(lib.askLanguage('a text', NOW)).resolves.toEqual({
      kind: 'language',
      language,
      usage: { inputTokens: 12, outputTokens: 34, cacheReadTokens: 5600, cacheWriteTokens: 78 },
    });
  });

  it.each([
    ['a language outside the list', '{"language":"de"}'],
    ['no language at all', '{"lingua":"it"}'],
    ['JSON that is not an object', 'null'],
    ['a sentence instead of JSON', 'The message is written in Italian.'],
    ['nothing', ''],
  ])('gives English for an answer that is not what was asked for: %s', async (_name, text) => {
    const lib = await load();
    languageAnswer(text);

    await expect(lib.askLanguage('a text', NOW)).resolves.toMatchObject({ kind: 'language', language: 'en' });
  });

  it('gives English when the answer was refused and holds no text', async () => {
    const lib = await load();
    answers({ stop_reason: 'refusal', content: [] });

    await expect(lib.askLanguage('a text', NOW)).resolves.toMatchObject({ kind: 'language', language: 'en' });
  });
});

describe('what never leaves the module', () => {
  const TEXT = 'a private sentence of the conversation';
  const ANTHROPIC_MESSAGE = 'the message Anthropic wrote about the failure';

  // An error of the SDK that carries all three: the key in a header, Anthropic's message, and a
  // text of the conversation echoed in it.
  const loaded = (status: number, error: Record<string, unknown>) =>
    Anthropic.APIError.generate(
      status,
      { type: 'error', error: { ...error, message: `${ANTHROPIC_MESSAGE}: ${TEXT} (${KEY})` }, request_id: 'req_test' },
      undefined,
      new Headers({ 'x-api-key': KEY, 'request-id': 'req_test' }),
    );

  it.each([
    ['unavailable', () => loaded(500, { type: 'api_error' })],
    ['key refused', () => loaded(401, { type: 'authentication_error' })],
    ['request refused', () => loaded(400, { type: 'invalid_request_error' })],
    ['budget reached', () => loaded(429, { type: 'rate_limit_error', details: { error_code: 'enforced_spend_limit_reached' } })],
    ['no connection', () => new Anthropic.APIConnectionError({ message: `${ANTHROPIC_MESSAGE}: ${TEXT} (${KEY})`, cause: new Error(KEY) })],
  ])('a result of a failure (%s) holds neither the key, nor a text, nor the message of Anthropic', async (_name, error) => {
    const lib = await load();
    const stdout = vi.spyOn(process.stdout, 'write');
    const stderr = vi.spyOn(process.stderr, 'write');
    fails(error());

    const results = JSON.stringify([
      await lib.askStep(request({ conversation: [{ role: 'user', content: TEXT }] }), NOW),
      await lib.askLanguage(TEXT, NOW),
    ]);

    expect(results).not.toContain(KEY);
    expect(results).not.toContain(TEXT);
    expect(results).not.toContain(ANTHROPIC_MESSAGE);
    expect(results).not.toContain('req_test');
    // The module logs nothing.
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
    stdout.mockRestore();
    stderr.mockRestore();
  });

  it('a result that succeeded holds the answer and the counts, never the key or what was sent', async () => {
    const lib = await load();
    answers();

    const result = JSON.stringify(await lib.askStep(request({ instructions: TEXT, conversation: [{ role: 'user', content: TEXT }] }), NOW));

    expect(result).not.toContain(KEY);
    expect(result).not.toContain(TEXT);
  });
});

describe('the configuration', () => {
  it('assistantModel gives the model of the deployment', async () => {
    const lib = await load({ model: 'claude-haiku-5-5' });

    expect(lib.assistantModel()).toBe('claude-haiku-5-5');
  });

  it('assistantEffort gives the low effort when the deployment names none, and a step is asked with it', async () => {
    const lib = await load();
    answers();

    expect(lib.assistantEffort()).toBe('low');
    await lib.askStep(request(), NOW);
    expect(create.mock.calls[0]?.[0]).toMatchObject({ output_config: { effort: 'low' } });
  });

  it('a step is asked with the effort ASSISTANT_EFFORT names, the language question always with the low one', async () => {
    const lib = await load({ effort: 'medium' });
    answers();

    expect(lib.assistantEffort()).toBe('medium');
    await lib.askStep(request(), NOW);
    expect(create.mock.calls[0]?.[0]).toMatchObject({ output_config: { effort: 'medium' } });

    languageAnswer('{"language":"it"}');
    await lib.askLanguage('ciao', NOW);
    expect(create.mock.calls[1]?.[0]).toMatchObject({ output_config: { effort: 'low' } });
  });

  it('throws its own error for an effort that is no level, and asks nothing', async () => {
    const lib = await load({ effort: 'extreme' });

    expect(() => lib.assistantEffort()).toThrow(lib.AnthropicConfigError);
    await expect(lib.askStep(request(), NOW)).rejects.toThrow('ASSISTANT_EFFORT is not one of low, medium, high, xhigh, max');
    expect(create).not.toHaveBeenCalled();
  });

  it('throws its own error when ASSISTANT_MODEL is not set, and keeps it for the next call', async () => {
    const lib = await load();
    vi.stubEnv('ASSISTANT_MODEL', '');
    vi.resetModules();
    const broken = await import('../../../src/lib/anthropic');

    await expect(broken.askStep(request(), NOW)).rejects.toThrow(broken.AnthropicConfigError);
    await expect(broken.askLanguage('ciao', NOW)).rejects.toThrow('ASSISTANT_MODEL is not set');
    // Kept: setting the variable afterwards changes nothing for this container.
    vi.stubEnv('ASSISTANT_MODEL', MODEL);
    expect(() => broken.assistantModel()).toThrow(broken.AnthropicConfigError);
    expect(create).not.toHaveBeenCalled();
    // The copy loaded with the variable set is not affected.
    expect(lib.assistantModel()).toBe(MODEL);
  });

  it('reads the environment once: a later change does not reach the container', async () => {
    const lib = await load();
    answers();
    await lib.askStep(request(), NOW);

    vi.stubEnv('ASSISTANT_MODEL', 'claude-opus-5-5');
    await lib.askStep(request(), NOW);

    expect(sentBody(1).model).toBe(MODEL);
  });
});
