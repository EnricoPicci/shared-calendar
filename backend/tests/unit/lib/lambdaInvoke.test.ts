import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { startMailer } from '../../../src/lib/lambdaInvoke';
import type { MailerEvent } from '../../../src/lib/mailerEvent';

// The mailer's start in the background (docs/EMAIL_ARCHITECTURE.md section 6.1).
const lambda = mockClient(LambdaClient);
const EVENT: MailerEvent = { kind: 'mine', sub: 'sub-alice', username: 'alice', role: 'user', from: '2026-12-01', to: '2026-12-07', requestId: 'req-1' };

beforeEach(() => {
  lambda.reset();
  vi.stubEnv('MAILER_FUNCTION', 'shared-calendar-api-MailerFunction-abc');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('startMailer', () => {
  it('invokes the mailer named by MAILER_FUNCTION asynchronously, the event as JSON', async () => {
    lambda.on(InvokeCommand).resolves({ StatusCode: 202 });

    await startMailer(EVENT);

    const input = lambda.commandCalls(InvokeCommand)[0]!.args[0].input;
    expect(input.FunctionName).toBe('shared-calendar-api-MailerFunction-abc');
    expect(input.InvocationType).toBe('Event');
    expect(JSON.parse(new TextDecoder().decode(input.Payload as Uint8Array))).toEqual(EVENT);
  });

  it('throws when Lambda answers anything but 202', async () => {
    lambda.on(InvokeCommand).resolves({ StatusCode: 200 });
    await expect(startMailer(EVENT)).rejects.toThrow("Lambda answered 200 to the mailer's start");
  });

  it('throws, calling nothing, without MAILER_FUNCTION', async () => {
    vi.stubEnv('MAILER_FUNCTION', '');
    await expect(startMailer(EVENT)).rejects.toThrow('MAILER_FUNCTION is not set');
    expect(lambda.calls()).toHaveLength(0);
  });

  it('takes its endpoint from LAMBDA_ENDPOINT, and the default without it', async () => {
    vi.stubEnv('LAMBDA_ENDPOINT', 'http://host.docker.internal:3001');
    vi.resetModules();
    const local = await import('../../../src/lib/lambdaInvoke');
    expect(await local.lambdaClient.config.endpoint?.()).toMatchObject({ hostname: 'host.docker.internal', port: 3001 });
    vi.stubEnv('LAMBDA_ENDPOINT', '');
    vi.resetModules();
    const cloud = await import('../../../src/lib/lambdaInvoke');
    expect(cloud.lambdaClient.config.endpoint).toBeUndefined();
  });
});
