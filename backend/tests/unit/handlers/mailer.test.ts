import { AdminGetUserCommand, CognitoIdentityProviderClient, ListUsersInGroupCommand, UserNotFoundException } from '@aws-sdk/client-cognito-identity-provider';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import readXlsxFile from 'read-excel-file/node';
import { storedItem } from './appointmentFixtures';

type Handler = typeof import('../../../src/handlers/mailer').handler;
let handler: Handler;

// The mailer, kinds `calendar` and `mine` (docs/EMAIL_ARCHITECTURE.md sections 6.1, 6.3 and 16).
// Alice's appointment of the fixtures, 2026-11-16 09:00–10:00 local, and bob's, cancelled.
const ddb = mockClient(DynamoDBDocumentClient);
const cognito = mockClient(CognitoIdentityProviderClient);
const ses = mockClient(SESv2Client);

const MINE = { kind: 'mine', sub: 'sub-alice', username: 'alice', role: 'user', from: '2026-11-16', to: '2026-11-22', requestId: 'req-route' };
const CALENDAR = { ...MINE, kind: 'calendar', sub: 'sub-admin', username: 'admin', role: 'admin' };
const ALICE_APPT = storedItem();
const BOB_APPT = storedItem({ SK: '2026-11-16T10:00:00.000Z#BOB', userId: 'sub-bob', username: 'bob', start: '2026-11-16T10:00:00.000Z', end: '2026-11-16T11:00:00.000Z', status: 'cancelled', cancelReason: 'cancelled', note: null });

let output: string[];
const logLines = () => output.map((line) => JSON.parse(line) as Record<string, unknown>);
const profile = (email: string | null) => ({
  UserCreateDate: new Date('2026-11-01T00:00:00.000Z'),
  UserAttributes: [{ Name: 'given_name', Value: 'Anna' }, ...(email === null ? [] : [{ Name: 'email', Value: email }])],
});
const sent = () => ses.commandCalls(SendEmailCommand)[0]!.args[0].input;
const rowsOfSent = async () => (await readXlsxFile(Buffer.from(sent().Content!.Simple!.Attachments![0]!.RawContent!)))[0]!.data;

beforeEach(async () => {
  ddb.reset();
  cognito.reset();
  ses.reset();
  ddb.on(GetCommand).resolves({});
  ddb.on(QueryCommand).resolves({ Items: [] });
  ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'TYPE' } }).resolves({ Items: [{ PK: 'TYPE', SK: ALICE_APPT.typeId, name: 'Studio', nameKey: 'studio' }] });
  ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'APPT' } }).resolves({ Items: [ALICE_APPT, BOB_APPT] });
  cognito.on(AdminGetUserCommand).resolves(profile('anna@example.com'));
  cognito.on(ListUsersInGroupCommand).resolves({
    Users: [{ Username: 'alice', Attributes: [{ Name: 'sub', Value: 'sub-alice' }, { Name: 'given_name', Value: 'Alice' }, { Name: 'family_name', Value: 'Liddell' }] }],
  });
  ses.on(SendEmailCommand).resolves({ MessageId: 'ses-1' });
  vi.stubEnv('CALENDAR_TABLE', 'calendar-test');
  vi.stubEnv('CALENDAR_TIME_ZONE', 'Europe/Rome');
  vi.stubEnv('USER_POOL_ID', 'eu-west-1_TEST');
  vi.stubEnv('MAIL_FROM', 'Shared calendar <noreply@example.com>');
  vi.stubEnv('MAIL_REPLY_TO', 'replies@example.com');
  output = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
  vi.resetModules();
  handler = (await import('../../../src/handlers/mailer')).handler;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('mailer handler', () => {
  it("mine: a User's own appointments, every status, to the address read in Cognito, listed and attached", async () => {
    await expect(handler(MINE, { awsRequestId: 'inv-1' })).resolves.toEqual({ outcome: 'sent', appointmentCount: 1 });

    expect(cognito.commandCalls(AdminGetUserCommand)[0]!.args[0].input).toEqual({ UserPoolId: 'eu-west-1_TEST', Username: 'alice' });
    expect(cognito.commandCalls(ListUsersInGroupCommand)).toHaveLength(0);
    const mail = sent();
    expect(mail.Destination).toEqual({ ToAddresses: ['anna@example.com'] });
    expect(mail.Content!.Simple!.Subject!.Data).toBe('Your appointments, Mon 16 Nov 2026 to Sun 22 Nov 2026');
    expect(mail.Content!.Simple!.Body!.Text!.Data).toContain('- Mon 16 Nov 2026, 09:00–10:00, Studio, booked');
    expect(mail.Content!.Simple!.Attachments![0]!.FileName).toBe('my-appointments-2026-11-16-to-2026-11-22.xlsx');
    const rows = await rowsOfSent();
    expect(rows[0]).not.toContain('First name');
    expect(rows.slice(1).map((r) => r[4])).toEqual(['alice']);
  });

  it('calendar: every appointment of the range with the names, to the Administrator who asked', async () => {
    await expect(handler(CALENDAR)).resolves.toEqual({ outcome: 'sent', appointmentCount: 2 });

    expect(sent().Content!.Simple!.Subject!.Data).toBe('Calendar, Mon 16 Nov 2026 to Sun 22 Nov 2026');
    expect(sent().Content!.Simple!.Attachments![0]!.FileName).toBe('calendar-2026-11-16-to-2026-11-22.xlsx');
    const rows = await rowsOfSent();
    expect(rows.slice(1).map((r) => [r[4], r[5], r[6], r[7]])).toEqual([
      ['alice', 'Alice', 'Liddell', 'booked'],
      ['bob', null, null, 'cancelled'],
    ]);
    const appt = ddb.commandCalls(QueryCommand).map((c) => c.args[0].input).find((q) => q.ExpressionAttributeValues![':pk'] === 'APPT')!;
    expect(appt.ExpressionAttributeValues).toMatchObject({ ':from': '2026-11-15T23:00:00.000Z', ':to': '2026-11-22T23:00:00.000Z' });
  });

  it('writes one log line with the kind, the username, the range, the count and the message id, no address, no name, no text', async () => {
    await handler(CALENDAR, { awsRequestId: 'inv-1' });

    expect(logLines()).toEqual([
      expect.objectContaining({ level: 'info', requestId: 'req-route', invocationId: 'inv-1', kind: 'calendar', username: 'admin', role: 'admin', from: '2026-11-16', to: '2026-11-22', appointmentCount: 2, sesMessageId: 'ses-1', outcome: 'sent' }),
    ]);
    const all = output.join('');
    for (const secret of ['anna@example.com', 'Anna', 'Liddell', 'private note', 'Calendar, Mon']) expect(all).not.toContain(secret);
  });

  it('an event that is not one sends nothing and logs only the paths of what is wrong', async () => {
    await expect(handler({ ...MINE, email: 'someone@example.com' })).resolves.toEqual({ outcome: 'invalid_event' });
    await expect(handler({ ...MINE, kind: 'calendar' })).resolves.toEqual({ outcome: 'invalid_event' });
    await expect(handler(null)).resolves.toEqual({ outcome: 'invalid_event' });

    expect(ses.calls()).toHaveLength(0);
    expect(cognito.calls()).toHaveLength(0);
    expect(logLines()[0]).toMatchObject({ level: 'error', requestId: 'unknown', invocationId: 'unknown', outcome: 'invalid_event', problems: ['email'] });
    expect(logLines()[2]).toMatchObject({ problems: ['(root)'] });
    expect(output.join('')).not.toContain('someone@example.com');
  });

  it('a person without an address is a logged failure, not a mail, and not tried again', async () => {
    cognito.on(AdminGetUserCommand).resolves(profile(null));
    await expect(handler(MINE)).resolves.toEqual({ outcome: 'no_email_address' });
    expect(ses.calls()).toHaveLength(0);
    expect(logLines()[0]).toMatchObject({ level: 'error', outcome: 'no_email_address', username: 'alice' });
  });

  it('an account deleted since the request is a logged failure, not a mail', async () => {
    cognito.on(AdminGetUserCommand).rejects(new UserNotFoundException({ message: 'User does not exist.', $metadata: {} }));
    await expect(handler(MINE)).resolves.toEqual({ outcome: 'user_not_found' });
    expect(ses.calls()).toHaveLength(0);
  });

  it("any other failure is thrown, for Lambda's retries, carrying and logging the error's name only", async () => {
    ses.on(SendEmailCommand).rejects(Object.assign(new Error('Email address is not verified: anna@example.com'), { name: 'MessageRejected' }));

    await expect(handler(MINE)).rejects.toThrow(new Error('The mail was not sent: MessageRejected'));

    expect(logLines()[0]).toMatchObject({ level: 'error', outcome: 'error', reason: 'MessageRejected', requestId: 'req-route' });
    expect(output.join('')).not.toContain('anna@example.com');
  });

  it('a failure without a name, and a broken time zone, are thrown too', async () => {
    cognito.on(AdminGetUserCommand).rejects('just a text');
    await expect(handler(MINE)).rejects.toThrow('The mail was not sent: Error');
    cognito.on(AdminGetUserCommand).callsFake(() => Promise.reject(null));
    await expect(handler(MINE)).rejects.toThrow('The mail was not sent: Error');

    vi.stubEnv('CALENDAR_TIME_ZONE', 'Mars/Olympus');
    vi.resetModules();
    const broken = (await import('../../../src/handlers/mailer')).handler;
    await expect(broken(MINE)).rejects.toThrow('The mail was not sent: CalendarConfigError');
  });
});
