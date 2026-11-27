import type { CustomMessageTriggerEvent } from 'aws-lambda';
import { handler } from '../../../src/handlers/inviteMessage';

// The invitation function, Cognito's "custom message" trigger (docs/MULTILANGUAGE_ARCHITECTURE.md section 7).

const PAGE = 'https://calendar.example.com';

function event(source: CustomMessageTriggerEvent['triggerSource'], attributes: Record<string, string> = {}): CustomMessageTriggerEvent {
  return {
    version: '1',
    region: 'eu-north-1',
    userPoolId: 'eu-north-1_TEST',
    userName: 'newbie',
    callerContext: { awsSdkVersion: 'x', clientId: 'CLIENT_ID_NOT_APPLICABLE' },
    triggerSource: source,
    request: {
      userAttributes: { sub: 'sub-1', email: 'newbie@example.com', given_name: 'Nina', ...attributes },
      codeParameter: '{####}',
      linkParameter: '{##Click Here##}',
      usernameParameter: source === 'CustomMessage_AdminCreateUser' ? '{username}' : null,
    },
    response: { smsMessage: null, emailMessage: null, emailSubject: null },
  } as CustomMessageTriggerEvent;
}

let output: string[];
beforeEach(() => {
  vi.stubEnv('PAGE_ADDRESS', PAGE);
  output = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const logLines = () => output.map((line) => JSON.parse(line) as Record<string, unknown>);

describe('inviteMessage handler', () => {
  it('an invitation to a person with no language: the installation\'s, English when it is unset, with both placeholders once and the page', async () => {
    const answer = await handler(event('CustomMessage_AdminCreateUser'));
    expect(answer.response.emailSubject).toBe('Your account on the shared calendar');
    const body = answer.response.emailMessage!;
    expect(body.startsWith('<div lang="en">')).toBe(true);
    expect([body.split('{username}').length, body.split('{####}').length]).toEqual([2, 2]);
    expect(body).toContain(`<a href="${PAGE}">${PAGE}</a>`);
    expect(body.length).toBeLessThanOrEqual(20_000);
    expect(answer.response.emailSubject!.length).toBeLessThanOrEqual(140);
    expect(answer.response.smsMessage).toBeNull();
  });

  it.each([
    ['no language', {}],
    ['a word that is not a language of the calendar', { locale: 'fr' }],
  ])('DEFAULT_LANGUAGE at it, %s: the invitation in Italian', async (_case, attributes) => {
    vi.stubEnv('DEFAULT_LANGUAGE', 'it');
    const answer = await handler(event('CustomMessage_AdminCreateUser', attributes));
    expect(answer.response.emailSubject).toBe('Il suo account sul calendario condiviso');
    expect(answer.response.emailMessage).toContain('<p>Nome utente: {username}<br>Password temporanea: {####}</p>');
  });

  it('a person whose language is held: theirs, over the installation\'s', async () => {
    vi.stubEnv('DEFAULT_LANGUAGE', 'it');
    expect((await handler(event('CustomMessage_AdminCreateUser', { locale: 'en' }))).response.emailSubject).toBe('Your account on the shared calendar');
    vi.stubEnv('DEFAULT_LANGUAGE', 'en');
    expect((await handler(event('CustomMessage_AdminCreateUser', { locale: 'it' }))).response.emailSubject).toBe('Il suo account sul calendario condiviso');
  });

  it('any other kind of message is answered untouched', async () => {
    const asked = event('CustomMessage_ForgotPassword');
    const answer = await handler(asked);
    expect(answer.response).toEqual({ smsMessage: null, emailMessage: null, emailSubject: null });
    expect(logLines()).toEqual([expect.objectContaining({ level: 'info', source: 'CustomMessage_ForgotPassword', outcome: 'untouched' })]);
  });

  it('one log line with the kind and the language\'s code, nothing personal and no text', async () => {
    await handler(event('CustomMessage_AdminCreateUser', { locale: 'it' }));
    expect(logLines()).toEqual([expect.objectContaining({ level: 'info', source: 'CustomMessage_AdminCreateUser', language: 'it', outcome: 'worded' })]);
    for (const secret of ['newbie', 'Nina', 'example.com', 'Buongiorno', '{####}']) expect(output.join('')).not.toContain(secret);
  });

  it('without a page address, or a username placeholder, the body still holds the placeholders it needs', async () => {
    delete process.env.PAGE_ADDRESS;
    const asked = event('CustomMessage_AdminCreateUser');
    (asked.request as { usernameParameter: string | null }).usernameParameter = null;
    const body = (await handler(asked)).response.emailMessage!;
    expect(body).toContain('{username}');
    expect(body).toContain('<a href=""></a>');
  });
});
