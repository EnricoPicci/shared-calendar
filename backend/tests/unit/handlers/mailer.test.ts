import { AdminGetUserCommand, CognitoIdentityProviderClient, ListUsersInGroupCommand, UserNotFoundException } from '@aws-sdk/client-cognito-identity-provider';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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

// The daily mail (docs/EMAIL_ARCHITECTURE.md sections 6.2 and 6.3). "Now" is 07:00 in Rome on Monday
// 16 November 2026, the default hour: alice's appointment of that day is in the next 7 days, bob's
// cancelled one and carol's of 20 December only in the backup, from 1 October.
// Test names: section numbers are those of docs/EMAIL_ARCHITECTURE.md.
describe('mailer handler, the daily mail (6.2, 6.3)', () => {
  const AT_SEVEN = '2026-11-16T06:00:00.000Z';
  const DAILY = { kind: 'daily', now: AT_SEVEN };
  const CAROL_APPT = storedItem({ SK: '2026-12-20T09:00:00.000Z#CAROL', userId: 'sub-carol', username: 'carol', date: '2026-12-20', start: '2026-12-20T09:00:00.000Z', end: '2026-12-20T10:00:00.000Z' });
  const admin = (username: string, email: string | null) => ({ Username: username, Attributes: email === null ? [] : [{ Name: 'email', Value: email }] });
  const conditionFailed = () => new ConditionalCheckFailedException({ message: 'The conditional request failed', $metadata: {} });
  const mails = () => ses.commandCalls(SendEmailCommand).map((c) => c.args[0].input);
  const fileRows = async (mail: number, file: number) => (await readXlsxFile(Buffer.from(mails()[mail]!.Content!.Simple!.Attachments![file]!.RawContent!)))[0]!.data;
  const finish = () => ddb.commandCalls(UpdateCommand).map((c) => c.args[0].input);

  beforeEach(() => {
    vi.stubEnv('MAIL_STAGE', 'on');
    vi.stubEnv('MAIL_TABLE', 'mail');
    vi.stubEnv('MAIL_ALLOW_NOW', 'true');
    ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'APPT' } }).resolves({ Items: [ALICE_APPT, BOB_APPT, CAROL_APPT] });
    ddb.on(GetCommand, { TableName: 'mail' }).resolves({});
    ddb.on(PutCommand).resolves({});
    ddb.on(UpdateCommand).resolves({});
    cognito.on(ListUsersInGroupCommand, { GroupName: 'admin' }).resolves({ Users: [admin('admin', 'ada@example.com'), admin('nomail', null)] });
  });

  it('at the chosen hour: the mark taken, one mail with the two files to each administrator with an address, the mark sent', async () => {
    await expect(handler(DAILY, { awsRequestId: 'inv-9' })).resolves.toEqual({
      outcome: 'sent', date: '2026-11-16', hour: 7, mailCount: 1, skipped: ['nomail'], appointmentCount: 1, backupCount: 3,
    });

    expect(ddb.commandCalls(PutCommand)[0]!.args[0].input.Item).toMatchObject({ PK: 'DAILY', SK: '2026-11-16', state: 'sending', startedAt: AT_SEVEN });
    expect(ddb.commandCalls(PutCommand)[0]!.args[0].input.ConditionExpression).toMatch(/^attribute_not_exists\(PK\) OR /);
    const appt = ddb.commandCalls(QueryCommand).map((c) => c.args[0].input).find((q) => q.ExpressionAttributeValues![':pk'] === 'APPT')!;
    expect(appt.ExpressionAttributeValues).toMatchObject({ ':from': '2026-09-30T22:00:00.000Z', ':to': '2027-11-17T23:00:00.000Z' });

    expect(mails()).toHaveLength(1);
    const mail = mails()[0]!;
    expect(mail.Destination).toEqual({ ToAddresses: ['ada@example.com'] });
    expect(mail.Content!.Simple!.Subject!.Data).toBe('Calendar: next 7 days and backup, Mon 16 Nov 2026');
    expect(mail.Content!.Simple!.Body!.Text!.Data).toContain('The backup covers every appointment from Thu 1 Oct 2026 onwards.');
    expect(mail.Content!.Simple!.Attachments!.map((a) => a.FileName)).toEqual(['calendar-next-7-days-2026-11-16.xlsx', 'calendar-backup-from-2026-10-01.xlsx']);
    expect((await fileRows(0, 0)).slice(1).map((r) => [r[0], r[4], r[5], r[7]])).toEqual([['2026-11-16', 'alice', 'Alice', 'booked']]);
    expect((await fileRows(0, 1)).slice(1).map((r) => [r[0], r[4], r[7]])).toEqual([
      ['2026-11-16', 'alice', 'booked'],
      ['2026-11-16', 'bob', 'cancelled'],
      ['2026-12-20', 'carol', 'booked'],
    ]);

    expect(finish()).toEqual([
      expect.objectContaining({
        Key: { PK: 'DAILY', SK: '2026-11-16' },
        ExpressionAttributeValues: expect.objectContaining({ ':state': 'sent', ':startedAt': AT_SEVEN, ':ids': ['ses-1'], ':count': 1, ':backup': 3 }),
      }),
    ]);
  });

  it('several administrators: a mail of their own each, nobody sees another\'s address', async () => {
    cognito.on(ListUsersInGroupCommand, { GroupName: 'admin' }).resolves({ Users: [admin('boss', 'boss@example.com'), admin('admin', 'ada@example.com')] });
    await expect(handler(DAILY)).resolves.toMatchObject({ outcome: 'sent', mailCount: 2, skipped: [] });
    expect(mails().map((m) => m.Destination)).toEqual([{ ToAddresses: ['ada@example.com'] }, { ToAddresses: ['boss@example.com'] }]);
  });

  it('writes one log line: the outcome, the date, the hour, the mails sent and skipped, the counts; no address, no name', async () => {
    await handler(DAILY, { awsRequestId: 'inv-9' });
    expect(logLines()).toEqual([
      expect.objectContaining({
        level: 'info', requestId: 'inv-9', invocationId: 'inv-9', kind: 'daily', outcome: 'sent', date: '2026-11-16', hour: 7,
        mailCount: 1, skipped: ['nomail'], appointmentCount: 1, backupCount: 3, sesMessageIds: ['ses-1'],
      }),
    ]);
    for (const secret of ['ada@example.com', 'Alice', 'Liddell', 'Calendar: next']) expect(output.join('')).not.toContain(secret);
  });

  it('a later hour of the same day: only a mark to take again lets the run go on', async () => {
    const atNine = { kind: 'daily', now: '2026-11-16T08:00:00.000Z' };
    ddb.on(PutCommand).rejects(conditionFailed());
    await expect(handler(atNine)).resolves.toEqual({ outcome: 'not_the_hour', date: '2026-11-16', hour: 9 });
    expect(ddb.commandCalls(PutCommand)[0]!.args[0].input.ConditionExpression).not.toMatch(/attribute_not_exists/);

    ddb.on(PutCommand).resolves({});
    await expect(handler(atNine)).resolves.toMatchObject({ outcome: 'sent', hour: 9 });
  });

  it.each([
    ['sent', 'already_sent'],
    ['sending', 'in_progress'],
  ])('a mark %s at the chosen hour stops the run: %s, nothing sent', async (state, outcome) => {
    ddb.on(PutCommand).rejects(conditionFailed());
    ddb.on(GetCommand, { TableName: 'mail', Key: { PK: 'DAILY', SK: '2026-11-16' } }).resolves({ Item: { state } });
    await expect(handler(DAILY)).resolves.toEqual({ outcome, date: '2026-11-16', hour: 7 });
    expect(mails()).toHaveLength(0);
    expect(cognito.calls()).toHaveLength(0);
  });

  it('an earlier hour, or the mail switched off, stops before the mark', async () => {
    await expect(handler({ kind: 'daily', now: '2026-11-16T05:00:00.000Z' })).resolves.toEqual({ outcome: 'not_the_hour', date: '2026-11-16', hour: 6 });
    ddb.on(GetCommand, { TableName: 'mail', Key: { PK: 'SETTINGS', SK: 'SETTINGS' } }).resolves({ Item: { dailyEnabled: false, dailyHour: 7 } });
    await expect(handler(DAILY)).resolves.toEqual({ outcome: 'switched_off', date: '2026-11-16', hour: 7 });
    expect(ddb.commandCalls(PutCommand)).toHaveLength(0);
    expect(mails()).toHaveLength(0);
  });

  it('the hour is read in the calendar\'s zone, and the chosen hour in the settings', async () => {
    ddb.on(GetCommand, { TableName: 'mail', Key: { PK: 'SETTINGS', SK: 'SETTINGS' } }).resolves({ Item: { dailyEnabled: true, dailyHour: 0 } });
    // 23:00 UTC on 15 November is midnight of the 16th in Rome.
    await expect(handler({ kind: 'daily', now: '2026-11-15T23:00:00.000Z' })).resolves.toMatchObject({ outcome: 'sent', date: '2026-11-16', hour: 0 });
  });

  it('January\'s backup starts on 1 December of the year before', async () => {
    await expect(handler({ kind: 'daily', now: '2027-01-05T06:00:00.000Z' })).resolves.toMatchObject({ outcome: 'sent' });
    expect(mails()[0]!.Content!.Simple!.Attachments![1]!.FileName).toBe('calendar-backup-from-2026-12-01.xlsx');
  });

  it('nobody to send to is an outcome, not an error: the mark sent with no mail', async () => {
    cognito.on(ListUsersInGroupCommand, { GroupName: 'admin' }).resolves({ Users: [admin('admin', null)] });
    await expect(handler(DAILY)).resolves.toEqual({ outcome: 'no_recipient', date: '2026-11-16', hour: 7, mailCount: 0, skipped: ['admin'] });
    expect(mails()).toHaveLength(0);
    expect(finish()[0]!.ExpressionAttributeValues).toMatchObject({ ':state': 'sent', ':ids': [] });
    expect(logLines()[0]).toMatchObject({ level: 'warn', outcome: 'no_recipient' });
  });

  it('a stage other than on stops before anything is read', async () => {
    vi.stubEnv('MAIL_STAGE', 'domain');
    await expect(handler(DAILY)).resolves.toEqual({ outcome: 'mail_unavailable' });
    expect(ddb.calls()).toHaveLength(0);
    expect(cognito.calls()).toHaveLength(0);
  });

  it('an event with now is refused without MAIL_ALLOW_NOW, and one with anything else always', async () => {
    vi.stubEnv('MAIL_ALLOW_NOW', '');
    await expect(handler(DAILY)).resolves.toEqual({ outcome: 'invalid_event' });
    await expect(handler({ kind: 'daily', username: 'admin' })).resolves.toEqual({ outcome: 'invalid_event' });
    expect(ddb.calls()).toHaveLength(0);
    expect(logLines().map((l) => [l.level, l.problems])).toEqual([['error', ['now']], ['error', ['username']]]);
  });

  it('without now, the run reads the clock', async () => {
    vi.useFakeTimers({ now: new Date(AT_SEVEN), toFake: ['Date'] });
    try {
      await expect(handler({ kind: 'daily' })).resolves.toMatchObject({ outcome: 'sent', date: '2026-11-16', hour: 7 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failure after the mark sets it failed and is thrown with its name only, for Lambda\'s retries and the alarm', async () => {
    cognito.on(ListUsersInGroupCommand, { GroupName: 'admin' }).resolves({ Users: [admin('admin', 'ada@example.com'), admin('boss', 'boss@example.com')] });
    ses.on(SendEmailCommand, { Destination: { ToAddresses: ['boss@example.com'] } }).rejects(Object.assign(new Error('rejected: boss@example.com'), { name: 'MessageRejected' }));

    await expect(handler(DAILY)).rejects.toThrow(new Error('The daily mail was not sent: MessageRejected'));

    expect(finish()).toEqual([expect.objectContaining({ ExpressionAttributeValues: expect.objectContaining({ ':state': 'failed', ':startedAt': AT_SEVEN }) })]);
    expect(logLines()[0]).toMatchObject({ level: 'error', kind: 'daily', outcome: 'error', reason: 'MessageRejected', date: '2026-11-16', mailCount: 1 });
    expect(output.join('')).not.toContain('boss@example.com');
  });

  it('a failure before the mark leaves no mark, and one in writing failed is swallowed', async () => {
    ddb.on(GetCommand, { TableName: 'mail' }).rejects(new Error('down'));
    await expect(handler(DAILY)).rejects.toThrow('The daily mail was not sent: Error');
    expect(finish()).toHaveLength(0);

    ddb.on(GetCommand, { TableName: 'mail' }).resolves({});
    ses.on(SendEmailCommand).rejects(new Error('ses down'));
    ddb.on(UpdateCommand).rejects(new Error('ddb down'));
    await expect(handler(DAILY)).rejects.toThrow('The daily mail was not sent: Error');
  });

  it('a mark taken over meanwhile is said in the log line', async () => {
    ddb.on(UpdateCommand).rejects(conditionFailed());
    await expect(handler(DAILY)).resolves.toMatchObject({ outcome: 'sent' });
    expect(logLines()[0]).toMatchObject({ markTakenOver: true });
  });
});
