import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  CognitoIdentityProviderClient,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { admin, bodyOf, claimsOf, cleanUp, eventAt, harness, lockBusy, NOW, P1, patternItem, STUDIO, ULID } from './availabilityFixtures';
import { typeItems } from './patternFixtures';

type Handler = typeof import('../../../src/handlers/bookAppointment').handler;
let handler: Handler;

// The dates of docs/SHARED_CALENDAR_SPEC.md section 18.3: now 2026-11-10T09:00Z (Tuesday),
// Europe/Rome; the pattern of docs/SHARED_CALENDAR_SPEC.md AC-04, Mon 08:00–12:00 Studio, so Monday
// 2026-11-16 09:00 local is 08:00Z. claimsOf gives `sub-<username>`.
const ROUTE = 'POST /calendar/appointments';
const { ddb, reset, onPartition, logLines, transactions, output } = harness();
const cognito = mockClient(CognitoIdentityProviderClient);
const alice = claimsOf('alice', ['user']);
const DAVE_SUB = 'c0a8-sub-of-dave';

const START = '2026-11-16T08:00:00.000Z';
const END = '2026-11-16T09:00:00.000Z';
const NOTE = 'First lesson, do not log';

async function load(timeZone = 'Europe/Rome'): Promise<Handler> {
  vi.stubEnv('CALENDAR_TABLE', 'calendar-test');
  vi.stubEnv('CALENDAR_TIME_ZONE', timeZone);
  vi.stubEnv('USER_POOL_ID', 'eu-north-1_TEST');
  vi.resetModules();
  return (await import('../../../src/handlers/bookAppointment')).handler;
}

const post = (body: unknown, claims: Record<string, string> = alice) =>
  handler(eventAt(ROUTE, claims, undefined, typeof body === 'string' ? body : JSON.stringify(body)));

/** A stored appointment item of another User on the Monday of docs/SHARED_CALENDAR_SPEC.md AC-04. */
const apptItem = (start: string, end: string, more: object = {}) => ({
  PK: 'APPT',
  SK: `${start}#01M70NR5E0Q7R2C9T5XH3KD8B0`,
  userId: 'sub-bob',
  username: 'bob',
  start,
  end,
  date: '2026-11-16',
  typeId: STUDIO,
  status: 'booked',
  ...more,
});

const cognitoTarget = (groups: string[], sub = DAVE_SUB) => {
  cognito.on(AdminGetUserCommand).resolves({ Username: 'dave', UserAttributes: [{ Name: 'sub', Value: sub }] });
  cognito.on(AdminListGroupsForUserCommand).resolves({ Groups: groups.map((GroupName) => ({ GroupName })) });
};

const cancelled = (...codes: string[]) =>
  new TransactionCanceledException({ message: 'Transaction cancelled', $metadata: {}, CancellationReasons: codes.map((Code) => ({ Code })) });

beforeEach(async () => {
  reset();
  cognito.reset();
  onPartition('PATTERN', [patternItem(P1)]);
  handler = await load();
});
afterEach(cleanUp);

// Test names: R-… rules and AC-… scenarios are those of docs/SHARED_CALENDAR_SPEC.md (scenarios in
// its section 18.3).
describe('bookAppointment handler', () => {
  describe('a User books for themself', () => {
    it('AC-10: 201 with the Appointment: end + 60 min, typeName, cancellableUntil, no userId', async () => {
      const response = await post({ start: START, note: `  ${NOTE}  ` });
      expect(response.statusCode).toBe(201);
      const booked = bodyOf(response);
      expect(booked).toEqual({
        appointmentId: expect.stringMatching(ULID),
        username: 'alice',
        start: START,
        end: END,
        date: '2026-11-16',
        typeId: STUDIO,
        typeName: 'Studio',
        note: NOTE,
        status: 'booked',
        createdAt: NOW,
        createdBy: { username: 'alice', role: 'user' },
        updatedAt: NOW,
        updatedBy: { username: 'alice', role: 'user' },
        cancelledAt: null,
        cancelledBy: null,
        cancelReason: null,
        replaces: null,
        replacedBy: null,
        cancellableUntil: '2026-11-15T08:00:00.000Z',
      });
      expect(Object.keys(booked)).not.toContain('userId');
      expect(Object.keys(booked)).not.toContain('version');
      // The token's sub is the owner and the marker checked; Cognito is not called.
      const items = transactions()[0]!.TransactItems!;
      expect(items[1]!.Put!.Item!.userId).toBe('sub-alice');
      expect(items[3]!.Put!.Item!.type).toBe('appointment.booked');
      expect(items[4]!.ConditionCheck!.Key).toEqual({ PK: 'DELETEDUSER#sub-alice', SK: 'DELETEDUSER' });
      expect(cognito.calls()).toHaveLength(0);
    });

    it('cancellableUntil follows the saved cancellation notice', async () => {
      ddb.on(GetCommand, { Key: { PK: 'SETTINGS', SK: 'SETTINGS' } }).resolves({
        Item: { cancellationNoticeHours: 48, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null, updatedAt: NOW, updatedBy: admin },
      });
      expect(bodyOf(await post({ start: START })).cancellableUntil).toBe('2026-11-14T08:00:00.000Z');
    });

    it('accepts its own username, and end = start + 60 min', async () => {
      expect((await post({ start: START, end: END, username: 'alice' })).statusCode).toBe(201);
    });

    it.each([
      ['an empty note', ''],
      ['a note of spaces', '   '],
      ['a null note', null],
    ])('stores %s as null', async (_name, note) => {
      expect(bodyOf(await post({ start: START, note })).note).toBeNull();
      expect(transactions()[0]!.TransactItems![1]!.Put!.Item!.note).toBeNull();
    });

    it('stores an absent note as null', async () => {
      expect(bodyOf(await post({ start: START })).note).toBeNull();
    });

    it('403 forbidden for a User naming someone else, before the grid and with nothing touched', async () => {
      const response = await post({ start: '2026-11-16T08:30:00.000Z', username: 'bob' });
      expect(response.statusCode).toBe(403);
      expect(bodyOf(response)).toEqual({ error: 'forbidden', message: 'A User can book only for themself' });
      expect(ddb.calls()).toHaveLength(0);
      expect(cognito.calls()).toHaveLength(0);
    });

    it('AC-13: 400 for 09:30 local, with nothing touched', async () => {
      const response = await post({ start: '2026-11-16T08:30:00.000Z' });
      expect(response.statusCode).toBe(400);
      expect(bodyOf(response)).toEqual({ error: 'invalid_request', message: 'Invalid input: start must be a whole hour' });
      expect(ddb.calls()).toHaveLength(0);
    });

    it('400 for an end other than start + 60 min', async () => {
      expect(bodyOf(await post({ start: START, end: '2026-11-16T08:30:00.000Z' })).message).toBe('Invalid input: end must be one hour after start');
    });
  });

  describe('the Administrator books for a User', () => {
    beforeEach(() => cognitoTarget(['user']));

    it('AC-14: 201 for dave 09:15–10:00 local, cancellableUntil null, the target’s sub from Cognito', async () => {
      const response = await post({ username: 'dave', start: '2026-11-16T08:15:00.000Z', end: END }, admin);
      expect(response.statusCode).toBe(201);
      expect(bodyOf(response)).toEqual(
        expect.objectContaining({
          username: 'dave',
          start: '2026-11-16T08:15:00.000Z',
          end: END,
          createdBy: { username: 'admin', role: 'admin' },
          cancellableUntil: null,
        }),
      );
      const items = transactions()[0]!.TransactItems!;
      expect(items[1]!.Put!.Item!.userId).toBe(DAVE_SUB);
      expect(items[3]!.Put!.Item!.actor).toEqual({ username: 'admin', role: 'admin' });
      expect(items[3]!.Put!.Item!.recipients).toEqual({ userId: DAVE_SUB, username: 'dave', administrator: true });
      expect(items[4]!.ConditionCheck!.Key).toEqual({ PK: `DELETEDUSER#${DAVE_SUB}`, SK: 'DELETEDUSER' });
      expect(cognito.commandCalls(AdminGetUserCommand)[0]!.args[0].input).toEqual({ UserPoolId: 'eu-north-1_TEST', Username: 'dave' });
    });

    it('AC-46 and AC-47: 201 for dave 10:10–10:35 local, and for five minutes', async () => {
      const custom = await post({ username: 'dave', start: '2026-11-16T09:10:00.000Z', end: '2026-11-16T09:35:00.000Z' }, admin);
      expect(custom.statusCode).toBe(201);
      expect(bodyOf(custom)).toEqual(expect.objectContaining({ start: '2026-11-16T09:10:00.000Z', end: '2026-11-16T09:35:00.000Z' }));
      const shortest = await post({ username: 'dave', start: '2026-11-16T10:00:00.000Z', end: '2026-11-16T10:05:00.000Z' }, admin);
      expect(shortest.statusCode).toBe(201);
      expect(bodyOf(shortest)).toEqual(expect.objectContaining({ start: '2026-11-16T10:00:00.000Z', end: '2026-11-16T10:05:00.000Z' }));
    });

    it('400 when username is absent, before Cognito', async () => {
      const response = await post({ start: START }, admin);
      expect(response.statusCode).toBe(400);
      expect(bodyOf(response)).toEqual({ error: 'invalid_request', message: 'Invalid input: username' });
      expect(cognito.calls()).toHaveLength(0);
      expect(ddb.calls()).toHaveLength(0);
    });

    it('400 for a start off the 5-minute grid, before Cognito', async () => {
      const response = await post({ username: 'dave', start: '2026-11-16T08:07:00.000Z' }, admin);
      expect(bodyOf(response)).toEqual({ error: 'invalid_request', message: 'Invalid input: start must be on a 5-minute step' });
      expect(cognito.calls()).toHaveLength(0);
    });

    it('404 user_not_found for an unknown username, before the lock', async () => {
      cognito.on(AdminGetUserCommand).rejects(new UserNotFoundException({ message: 'User does not exist.', $metadata: {} }));
      const response = await post({ username: 'ghost', start: START }, admin);
      expect(response.statusCode).toBe(404);
      expect(bodyOf(response)).toEqual({ error: 'user_not_found', message: 'No user with this username' });
      expect(ddb.calls()).toHaveLength(0);
    });

    it.each([
      ['an Administrator', ['admin']],
      ['in both groups', ['user', 'admin']],
      ['in no group', []],
    ])('409 target_not_user for a target %s, before the lock', async (_name, groups) => {
      cognitoTarget(groups);
      const response = await post({ username: 'admin', start: START }, admin);
      expect(response.statusCode).toBe(409);
      expect(bodyOf(response)).toEqual({ error: 'target_not_user', message: 'The account is not a User' });
      expect(ddb.calls()).toHaveLength(0);
    });

    it('500 when Cognito fails otherwise, with a generic body', async () => {
      cognito.on(AdminGetUserCommand).rejects(new Error('secret detail'));
      const response = await post({ username: 'dave', start: START }, admin);
      expect(response.statusCode).toBe(500);
      expect(bodyOf(response)).toEqual({ error: 'internal_error', message: 'Could not book the appointment' });
    });

    it('AC-17, AC-18, AC-19: exempt from horizon, notice and limit', async () => {
      ddb.on(GetCommand, { Key: { PK: 'SETTINGS', SK: 'SETTINGS' } }).resolves({
        Item: { cancellationNoticeHours: 24, minBookingNoticeHours: 720, bookingHorizonDays: 1, maxFutureAppointmentsPerUser: 1, updatedAt: NOW, updatedBy: admin },
      });
      onPartition('APPT', [apptItem('2026-11-16T10:00:00.000Z', '2026-11-16T11:00:00.000Z', { userId: DAVE_SUB, username: 'dave' })]);
      expect((await post({ username: 'dave', start: START }, admin)).statusCode).toBe(201);
    });
  });

  describe('the rules under the lock, mapped to 409', () => {
    it('AC-11: slot_taken', async () => {
      onPartition('APPT', [apptItem(START, END)]);
      const response = await post({ start: START });
      expect(response.statusCode).toBe(409);
      expect(bodyOf(response)).toEqual({ error: 'slot_taken', message: 'The time is already booked' });
      expect(transactions()).toHaveLength(0);
    });

    it('AC-15: slot_taken by the Administrator’s 09:15–10:00', async () => {
      onPartition('APPT', [apptItem('2026-11-16T08:15:00.000Z', END)]);
      expect(bodyOf(await post({ start: START })).error).toBe('slot_taken');
    });

    it('AC-16: outside_availability at 12:00 local', async () => {
      expect(bodyOf(await post({ start: '2026-11-16T11:00:00.000Z' }))).toEqual({ error: 'outside_availability', message: 'The time is not inside the availability' });
    });

    it('AC-17: booking_beyond_horizon with a horizon of 7', async () => {
      ddb.on(GetCommand, { Key: { PK: 'SETTINGS', SK: 'SETTINGS' } }).resolves({
        Item: { cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 7, maxFutureAppointmentsPerUser: null, updatedAt: NOW, updatedBy: admin },
      });
      const response = await post({ start: '2026-11-23T08:00:00.000Z' });
      expect(response.statusCode).toBe(409);
      expect(bodyOf(response).error).toBe('booking_beyond_horizon');
    });

    it('AC-18: booking_notice_too_short with a notice of 48 h at 2026-11-15T10:00 local', async () => {
      vi.setSystemTime(new Date('2026-11-15T09:00:00.000Z'));
      ddb.on(GetCommand, { Key: { PK: 'SETTINGS', SK: 'SETTINGS' } }).resolves({
        Item: { cancellationNoticeHours: 24, minBookingNoticeHours: 48, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null, updatedAt: NOW, updatedBy: admin },
      });
      expect(bodyOf(await post({ start: START }))).toEqual({ error: 'booking_notice_too_short', message: 'Not enough notice before the start' });
    });

    it('AC-19: appointment_limit_reached with a limit of 1', async () => {
      ddb.on(GetCommand, { Key: { PK: 'SETTINGS', SK: 'SETTINGS' } }).resolves({
        Item: { cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: 1, updatedAt: NOW, updatedBy: admin },
      });
      onPartition('APPT', [apptItem('2026-11-16T10:00:00.000Z', '2026-11-16T11:00:00.000Z', { userId: 'sub-alice', username: 'alice' })]);
      expect(bodyOf(await post({ start: START })).error).toBe('appointment_limit_reached');
    });

    it('R-BOOK-03: a start in the past is booking_in_past, also for the Administrator', async () => {
      cognitoTarget(['user']);
      const response = await post({ username: 'dave', start: '2026-11-09T08:00:00.000Z' }, admin);
      expect(bodyOf(response)).toEqual({ error: 'booking_in_past', message: 'The start is not in the future' });
    });

    it('AC-34: the first transaction loses the lock, the re-read finds the slot taken: 409 slot_taken', async () => {
      ddb
        .on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'APPT' } })
        .resolvesOnce({ Items: [] })
        .resolves({ Items: [apptItem(START, END)] });
      ddb.on(TransactWriteCommand).rejectsOnce(lockBusy());
      const pending = post({ start: START });
      await vi.runAllTimersAsync();
      const response = await pending;
      expect(response.statusCode).toBe(409);
      expect(bodyOf(response).error).toBe('slot_taken');
      expect(transactions()).toHaveLength(1);
      expect(logLines()).toEqual([expect.objectContaining({ outcome: 'conflict', status: 409, lockAttempts: 2 })]);
    });

    it('R-BOOK-10: the deleted-user marker answers 404 user_not_found, without a retry', async () => {
      ddb.on(TransactWriteCommand).rejects(cancelled('None', 'None', 'None', 'None', 'ConditionalCheckFailed'));
      const response = await post({ start: START });
      expect(response.statusCode).toBe(404);
      expect(bodyOf(response)).toEqual({ error: 'user_not_found', message: 'The user has been deleted' });
      expect(transactions()).toHaveLength(1);
    });

    it('409 concurrent_update when the lock stays busy', async () => {
      ddb.on(TransactWriteCommand).rejects(lockBusy());
      const pending = post({ start: START });
      await vi.runAllTimersAsync();
      const response = await pending;
      expect(response.statusCode).toBe(409);
      expect(bodyOf(response)).toEqual({ error: 'concurrent_update', message: 'The calendar is busy; try again' });
    });

    it('500 with a generic body when DynamoDB fails', async () => {
      ddb.on(TransactWriteCommand).rejects(new Error('secret detail'));
      const response = await post({ start: START });
      expect(response.statusCode).toBe(500);
      expect(bodyOf(response)).toEqual({ error: 'internal_error', message: 'Could not book the appointment' });
    });
  });

  describe('the body (400)', () => {
    it.each([
      { name: 'no body', raw: undefined, code: 'invalid_json', fields: undefined },
      { name: 'malformed JSON', raw: '{"start":', code: 'invalid_json', fields: undefined },
      { name: 'an unknown field (.strict())', raw: JSON.stringify({ start: START, typeId: STUDIO }), code: 'invalid_request', fields: 'typeId' },
      { name: 'a missing start', raw: JSON.stringify({ note: 'x' }), code: 'invalid_request', fields: 'start' },
      { name: 'an instant not in the exact form', raw: JSON.stringify({ start: '2026-11-16T08:00:00Z' }), code: 'invalid_request', fields: 'start' },
      { name: 'an instant with seconds', raw: JSON.stringify({ start: '2026-11-16T08:00:30.000Z' }), code: 'invalid_request', fields: 'start' },
      { name: 'end not after start', raw: JSON.stringify({ start: START, end: START }), code: 'invalid_request', fields: 'end' },
      { name: 'a note of 501 UTF-16 units', raw: JSON.stringify({ start: START, note: 'a'.repeat(499) + '😀' }), code: 'invalid_request', fields: 'note' },
      { name: 'a control character in the note', raw: JSON.stringify({ start: START, note: 'tab\there' }), code: 'invalid_request', fields: 'note' },
      { name: 'an invalid username', raw: JSON.stringify({ start: START, username: 'Bob' }), code: 'invalid_request', fields: 'username' },
    ])('answers 400 $code and touches nothing for $name', async ({ raw, code, fields }) => {
      const response = await handler(eventAt(ROUTE, alice, undefined, raw));
      expect(response.statusCode).toBe(400);
      expect(bodyOf(response).error).toBe(code);
      if (fields) expect(bodyOf(response).message).toBe(`Invalid input: ${fields}`);
      expect(ddb.calls()).toHaveLength(0);
    });

    it('accepts a note of exactly 500 UTF-16 units, with a line feed', async () => {
      const note = 'a'.repeat(497) + '\n😀';
      expect(note.length).toBe(500);
      expect(bodyOf(await post({ start: START, note })).note).toBe(note);
    });
  });

  describe('role and configuration', () => {
    it('403 for a token in neither group, with nothing touched', async () => {
      const response = await post({ start: START }, claimsOf('carol', []));
      expect(response.statusCode).toBe(403);
      expect(bodyOf(response).error).toBe('forbidden');
      expect(ddb.calls()).toHaveLength(0);
    });

    it('401 without an authorizer context', async () => {
      expect((await handler(eventAt(ROUTE, undefined, undefined, JSON.stringify({ start: START })))).statusCode).toBe(401);
    });

    it.each([[['admin']], [['user']]])('500 to every caller (groups %j) when the time zone is invalid', async (groups) => {
      handler = await load('Not/AZone');
      const response = await post({ start: START }, claimsOf('alice', groups));
      expect(response.statusCode).toBe(500);
      expect(bodyOf(response).message).toBe('The calendar is not configured');
      expect(ddb.calls()).toHaveLength(0);
    });
  });
});

// Test names: AC-… scenarios are those of docs/SHARED_CALENDAR_SPEC.md (scenarios in its section
// 18.3).
describe('bookAppointment handler logging (AC-36)', () => {
  it('a User’s booking: one info line with the appointmentId and the lock attempts; no note, body or sub', async () => {
    const response = await post({ start: START, note: NOTE });
    expect(logLines()).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        requestId: 'req-1',
        route: ROUTE,
        username: 'alice',
        role: 'user',
        lockAttempts: 1,
        appointmentId: bodyOf(response).appointmentId,
        outcome: 'created',
        status: 201,
        durationMs: expect.any(Number),
      },
    ]);
    const all = output.join('');
    expect(all).not.toContain(NOTE);
    expect(all).not.toContain('sub-alice');
    expect(all).not.toContain(START);
  });

  it('the Administrator’s booking names the target username, never its sub', async () => {
    cognitoTarget(['user']);
    await post({ username: 'dave', start: START, note: NOTE }, admin);
    expect(logLines()).toEqual([expect.objectContaining({ username: 'admin', role: 'admin', target: 'dave', outcome: 'created', status: 201 })]);
    expect(output.join('')).not.toContain(DAVE_SUB);
    expect(output.join('')).not.toContain(NOTE);
  });

  it('a refusal is logged as a conflict, without its message, and without an appointmentId', async () => {
    onPartition('APPT', [apptItem(START, END)]);
    await post({ start: START, note: NOTE });
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'conflict', status: 409, lockAttempts: 1 })]);
    expect(logLines()[0]).not.toHaveProperty('appointmentId');
    expect(output.join('')).not.toContain('already booked');
  });

  it('a rejected body is not echoed', async () => {
    await post({ start: START, secretField: 'do-not-log-me', note: NOTE });
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'invalid_request', status: 400 })]);
    expect(output.join('')).not.toContain('do-not-log-me');
    expect(output.join('')).not.toContain(NOTE);
  });

  it('a busy lock with 3 attempts, a DynamoDB failure and a Cognito failure at error level', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    const pending = post({ start: START });
    await vi.runAllTimersAsync();
    await pending;
    ddb.on(TransactWriteCommand).rejects(new Error('network down'));
    await post({ start: START });
    cognito.on(AdminGetUserCommand).rejects(new Error('cognito down'));
    await post({ username: 'dave', start: START }, admin);
    expect(logLines()).toEqual([
      expect.objectContaining({ outcome: 'conflict', status: 409, lockAttempts: 3 }),
      expect.objectContaining({ level: 'error', status: 500, reason: { name: 'Error', message: 'network down' } }),
      expect.objectContaining({ level: 'error', status: 500, target: 'dave', reason: { name: 'Error', message: 'cognito down' } }),
    ]);
  });

  it('the marker’s 404 and Cognito’s 404 and 409 are logged with their outcome', async () => {
    ddb.on(TransactWriteCommand).rejects(cancelled('None', 'None', 'None', 'None', 'ConditionalCheckFailed'));
    await post({ start: START });
    cognito.on(AdminGetUserCommand).rejects(new UserNotFoundException({ message: 'no', $metadata: {} }));
    await post({ username: 'ghost', start: START }, admin);
    cognitoTarget(['admin']);
    await post({ username: 'admin', start: START }, admin);
    expect(logLines()).toEqual([
      expect.objectContaining({ outcome: 'not_found', status: 404, lockAttempts: 1 }),
      expect.objectContaining({ outcome: 'not_found', status: 404, target: 'ghost' }),
      expect.objectContaining({ outcome: 'conflict', status: 409, target: 'admin' }),
    ]);
  });
});

// The Studio of docs/SHARED_CALENDAR_SPEC.md AC-04 with a capacity of 2; bob and carol hold
// 09:00 local in it.
const studioHolds = (capacity: number) => onPartition('TYPE', [{ ...typeItems[0]!, capacity }, typeItems[1]!]);
const carolItem = (start: string, end: string) => apptItem(start, end, { SK: `${start}#01M70NR5E0Q7R2C9T5XH3KD8C0`, userId: 'sub-carol', username: 'carol' });

// Test names: R-… rules and AC-… scenarios are those of docs/SHARED_CALENDAR_SPEC.md (scenarios in
// its section 18.3).
describe('bookAppointment handler: the capacity (R-BOOK-07, R-BOOK-12, R-BOOK-13)', () => {
  it('AC-37: a User books a slot that holds another person, in a capacity of 2: 201', async () => {
    studioHolds(2);
    onPartition('APPT', [apptItem(START, END)]);
    expect((await post({ start: START })).statusCode).toBe(201);
  });

  it('AC-38: the slot full: 409 slot_taken, nothing written', async () => {
    studioHolds(2);
    onPartition('APPT', [apptItem(START, END), carolItem(START, END)]);
    const response = await post({ start: START });
    expect(response.statusCode).toBe(409);
    expect(bodyOf(response)).toEqual({ error: 'slot_taken', message: 'The time is already booked' });
    expect(transactions()).toHaveLength(0);
  });

  it('AC-39: the Administrator: 409 slot_taken without overbook, 201 with overbook: true; nothing about the force is stored (D31)', async () => {
    studioHolds(2);
    onPartition('APPT', [apptItem(START, END), carolItem(START, END)]);
    cognitoTarget(['user']);
    expect(bodyOf(await post({ username: 'dave', start: START }, admin)).error).toBe('slot_taken');
    expect(bodyOf(await post({ username: 'dave', start: START, overbook: false }, admin)).error).toBe('slot_taken');
    const forced = await post({ username: 'dave', start: START, overbook: true }, admin);
    expect(forced.statusCode).toBe(201);
    expect(bodyOf(forced)).not.toHaveProperty('overbook');
    const items = transactions()[0]!.TransactItems!;
    expect(items[1]!.Put!.Item).not.toHaveProperty('overbook');
    expect(items[3]!.Put!.Item!.type).toBe('appointment.booked');
  });

  it('AC-40: the Administrator booking a User at a time the User holds: 409 user_busy, also with overbook: true', async () => {
    studioHolds(2);
    onPartition('APPT', [apptItem(START, END, { userId: DAVE_SUB, username: 'dave' })]);
    cognitoTarget(['user']);
    for (const overbook of [undefined, true]) {
      const response = await post({ username: 'dave', start: START, overbook }, admin);
      expect(response.statusCode).toBe(409);
      expect(bodyOf(response)).toEqual({ error: 'user_busy', message: 'The User already has an appointment at this time' });
    }
    expect(transactions()).toHaveLength(0);
  });

  it('R-BOOK-12: a User booking over their own appointment: 409 user_busy', async () => {
    onPartition('APPT', [apptItem('2026-11-16T08:30:00.000Z', END, { userId: 'sub-alice', username: 'alice' })]);
    expect(bodyOf(await post({ start: START }))).toEqual({ error: 'user_busy', message: 'The User already has an appointment at this time' });
  });

  it('AC-41: a User sending overbook: true is 403 forbidden, before the grid and with nothing touched', async () => {
    const response = await post({ start: '2026-11-16T08:30:00.000Z', overbook: true });
    expect(response.statusCode).toBe(403);
    expect(bodyOf(response)).toEqual({ error: 'forbidden', message: 'Only the Administrator can book over the capacity' });
    expect(ddb.calls()).toHaveLength(0);
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'forbidden', status: 403, username: 'alice' })]);
  });

  it('R-BOOK-13 after R-BOOK-01: a User naming someone else with overbook: true gets the naming’s 403', async () => {
    expect(bodyOf(await post({ start: START, username: 'bob', overbook: true }))).toEqual({ error: 'forbidden', message: 'A User can book only for themself' });
  });

  it('a User sending overbook: false books as without it', async () => {
    expect((await post({ start: START, overbook: false })).statusCode).toBe(201);
  });

  it('400 for an overbook that is not a boolean', async () => {
    const response = await post({ start: START, overbook: 'true' });
    expect(response.statusCode).toBe(400);
    expect(bodyOf(response).error).toBe('invalid_request');
  });
});
