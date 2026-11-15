import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  admin,
  aliceItem,
  bobItem,
  bodyOf,
  claimsOf,
  cleanUp,
  eventAt,
  harness,
  lockBusy,
  MONDAY,
  NOW,
  patternItem,
  POOL,
  P1,
  STUDIO,
  TODAY,
  UNKNOWN,
  W1,
  windowItem,
  YESTERDAY,
} from './availabilityFixtures';

// calendarDb reads its configuration once per container: each test loads a fresh handler.
type Handler = typeof import('../../../src/handlers/setOverride').handler;
let handler: Handler;

const ROUTE = 'PUT /calendar/overrides/{date}';
const { ddb, reset, onPartition, logLines, transactions, output } = harness();

async function load(timeZone = 'Europe/Rome'): Promise<Handler> {
  vi.stubEnv('CALENDAR_TABLE', 'calendar-test');
  vi.stubEnv('CALENDAR_TIME_ZONE', timeZone);
  vi.resetModules();
  return (await import('../../../src/handlers/setOverride')).handler;
}

const w = (start: string, end: string, typeId = STUDIO) => ({ start, end, typeId });
/** The override of docs/SHARED_CALENDAR_SPEC.md AC-06: 2026-11-16 [09:00–12:00 Studio]. */
const AC06 = { windows: [w('09:00', '12:00')] };
const put = (date: string, body: unknown = AC06, claims = admin) =>
  handler(eventAt(ROUTE, claims, { date }, typeof body === 'string' ? body : JSON.stringify(body)));

beforeEach(async () => {
  reset();
  // The pattern of docs/SHARED_CALENDAR_SPEC.md AC-04, Mon 08:00–12:00 Studio from 2026-11-01.
  onPartition('PATTERN', [patternItem(P1)]);
  handler = await load();
});
afterEach(cleanUp);

// Test names: section numbers, R-… rules and AC-… scenarios are those of
// docs/SHARED_CALENDAR_SPEC.md (scenarios in its section 18.3).
describe('setOverride handler', () => {
  it('AC-06: sets the override and answers 200 with the DateOverride, no updatedBy', async () => {
    const response = await put(MONDAY);
    expect(response.statusCode).toBe(200);
    expect(response.headers).toEqual({ 'content-type': 'application/json' });
    expect(bodyOf(response)).toEqual({ date: MONDAY, windows: [w('09:00', '12:00')], updatedAt: NOW });
    expect(transactions()[0]!.TransactItems![1]).toEqual({
      Put: {
        TableName: 'calendar-test',
        Item: { PK: 'OVERRIDE', SK: MONDAY, windows: [w('09:00', '12:00')], updatedAt: NOW, updatedBy: { username: 'admin', role: 'admin' } },
      },
    });
  });

  it('stores and answers the windows sorted by start, whatever the body’s order', async () => {
    const response = await put(MONDAY, { windows: [w('14:00', '18:00', POOL), w('09:00', '12:00')] });
    expect(bodyOf(response).windows).toEqual([w('09:00', '12:00'), w('14:00', '18:00', POOL)]);
  });

  it('AC-07: accepts an empty list (a closed day)', async () => {
    const response = await put('2026-11-23', { windows: [] });
    expect(response.statusCode).toBe(200);
    expect(bodyOf(response)).toEqual({ date: '2026-11-23', windows: [], updatedAt: NOW });
  });

  it('replaces an override the date already has (R-OVR-02)', async () => {
    onPartition('OVERRIDE', [{ PK: 'OVERRIDE', SK: MONDAY, windows: [w('14:00', '15:00', POOL)], updatedAt: '2026-11-01T08:00:00.000Z' }]);
    expect((await put(MONDAY, { windows: [w('14:30', '16:00')] })).statusCode).toBe(200);
  });

  describe('date_in_past (R-AV-02), before the lock', () => {
    it('refuses yesterday with 409 and touches nothing', async () => {
      const response = await put(YESTERDAY);
      expect(response.statusCode).toBe(409);
      expect(bodyOf(response)).toEqual({ error: 'date_in_past', message: 'The date is in the past' });
      expect(ddb.calls()).toHaveLength(0);
    });

    it('accepts today', async () => {
      expect((await put(TODAY, { windows: [w('18:00', '19:00')] })).statusCode).toBe(200);
    });

    it('uses the calendar zone’s today: at 23:30Z on the 16th, the 16th is already yesterday in Rome', async () => {
      vi.setSystemTime(new Date('2026-11-16T23:30:00.000Z'));
      expect((await put(MONDAY)).statusCode).toBe(409);
      expect((await put('2026-11-17')).statusCode).toBe(200);
    });

    it('answers a malformed body as 400 before date_in_past', async () => {
      expect((await put(YESTERDAY, { windows: 'none' })).statusCode).toBe(400);
    });
  });

  describe('limits', () => {
    const ten = Array.from({ length: 10 }, (_, i) => w(`${String(i + 8).padStart(2, '0')}:00`, `${String(i + 8).padStart(2, '0')}:30`));

    it('accepts 10 windows', async () => {
      expect((await put(MONDAY, { windows: ten })).statusCode).toBe(200);
    });

    it('refuses 11 windows with 400 (OverrideBody)', async () => {
      const response = await put(MONDAY, { windows: [...ten, w('20:00', '21:00')] });
      expect(response.statusCode).toBe(400);
      expect(bodyOf(response)).toEqual({ error: 'invalid_request', message: 'Invalid input: windows' });
      expect(ddb.calls()).toHaveLength(0);
    });
  });

  describe('overlap (6.5, "set an override")', () => {
    it('refuses two of its own windows that overlap, 409 with the date and both windows', async () => {
      const response = await put(MONDAY, { windows: [w('10:00', '12:00', POOL), w('09:00', '11:00')] });
      expect(response.statusCode).toBe(409);
      expect(bodyOf(response)).toEqual({
        error: 'availability_overlap',
        message: 'On 2026-11-16 the window 09:00–11:00 would overlap the window 10:00–12:00',
      });
      expect(transactions()).toHaveLength(0);
    });

    it('refuses a window that overlaps a one-off window of the date', async () => {
      onPartition('WINDOW', [windowItem(W1, MONDAY, '12:00', '13:00', STUDIO)]);
      const response = await put(MONDAY, { windows: [w('11:00', '12:30')] });
      expect(response.statusCode).toBe(409);
      expect(bodyOf(response)).toEqual({
        error: 'availability_overlap',
        message: 'On 2026-11-16 the window 11:00–12:30 would overlap the window 12:00–13:00',
      });
    });

    it('allows touching windows, also of different types, and a one-off window it touches', async () => {
      onPartition('WINDOW', [windowItem(W1, MONDAY, '12:00', '13:00', STUDIO)]);
      expect((await put(MONDAY, { windows: [w('09:00', '10:00'), w('10:00', '12:00', POOL), w('13:00', '14:00', POOL)] })).statusCode).toBe(200);
    });

    it('does not compare with the patterns it replaces (R-OVR-01)', async () => {
      expect((await put(MONDAY, { windows: [w('07:00', '13:00', POOL)] })).statusCode).toBe(200);
    });
  });

  describe('conflicts with appointments (R-AV-03, R-AV-04)', () => {
    // alice holds 2026-11-16 09:00–10:00 local Studio (08:00Z–09:00Z).
    beforeEach(() => onPartition('APPT', [aliceItem]));
    const aliceConflict = { appointmentId: 'A1', username: 'alice', start: aliceItem.start, end: aliceItem.end };

    it('AC-25: an empty override under alice’s appointment is 409 with conflicts', async () => {
      const response = await put(MONDAY, { windows: [] });
      expect(response.statusCode).toBe(409);
      expect(bodyOf(response)).toEqual({
        error: 'availability_conflict',
        message: '1 appointment would fall outside the availability',
        conflicts: [aliceConflict],
      });
      expect(transactions()).toHaveLength(0);
    });

    it.each([
      ['shrinks the window under it', [w('09:30', '12:00')]],
      ['changes the type under it', [w('08:00', '12:00', POOL)]],
    ])('a window that %s is a conflict', async (_, windows) => {
      expect(bodyOf(await put(MONDAY, { windows })).error).toBe('availability_conflict');
    });

    it('an appointment in progress counts', async () => {
      vi.setSystemTime(new Date('2026-11-16T08:30:00.000Z'));
      expect(bodyOf(await put(MONDAY, { windows: [w('10:00', '12:00')] })).error).toBe('availability_conflict');
    });

    it('a longer window never conflicts', async () => {
      expect((await put(MONDAY, { windows: [w('07:00', '13:00')] })).statusCode).toBe(200);
    });

    it('a cancelled appointment never conflicts', async () => {
      onPartition('APPT', [{ ...aliceItem, status: 'cancelled' }]);
      expect((await put(MONDAY, { windows: [] })).statusCode).toBe(200);
    });

    it('an ended appointment never conflicts (today accepted)', async () => {
      vi.setSystemTime(new Date('2026-11-16T09:00:00.000Z'));
      expect((await put(MONDAY, { windows: [] })).statusCode).toBe(200);
    });

    it('lists the conflicts by start', async () => {
      onPartition('APPT', [bobItem, aliceItem]);
      const response = await put(MONDAY, { windows: [] });
      expect(bodyOf(response)).toEqual({
        error: 'availability_conflict',
        message: '2 appointments would fall outside the availability',
        conflicts: [aliceConflict, { appointmentId: 'A2', username: 'bob', start: bobItem.start, end: bobItem.end }],
      });
    });
  });

  it('answers 409 type_not_found for an unknown typeId in a window', async () => {
    const response = await put(MONDAY, { windows: [w('09:00', '10:00', UNKNOWN)] });
    expect(response.statusCode).toBe(409);
    expect(bodyOf(response)).toEqual({ error: 'type_not_found', message: 'No availability type with this id' });
  });

  it.each([
    { name: 'no body', raw: undefined, code: 'invalid_json', fields: undefined },
    { name: 'malformed JSON', raw: '{"windows":', code: 'invalid_json', fields: undefined },
    { name: 'an unknown field (.strict())', raw: JSON.stringify({ ...AC06, date: MONDAY }), code: 'invalid_request', fields: 'date' },
    { name: 'an unknown field in a window', raw: JSON.stringify({ windows: [{ ...w('09:00', '10:00'), note: 'x' }] }), code: 'invalid_request', fields: 'windows.0.note' },
    { name: 'a missing windows', raw: JSON.stringify({}), code: 'invalid_request', fields: 'windows' },
    { name: 'end before start', raw: JSON.stringify({ windows: [w('12:00', '09:00')] }), code: 'invalid_request', fields: 'windows.0.end' },
    { name: 'a time off the grid', raw: JSON.stringify({ windows: [w('09:10', '10:00')] }), code: 'invalid_request', fields: 'windows.0.start' },
  ])('answers 400 $code and touches nothing for $name', async ({ raw, code, fields }) => {
    const response = await handler(eventAt(ROUTE, admin, { date: MONDAY }, raw));
    expect(response.statusCode).toBe(400);
    expect(bodyOf(response).error).toBe(code);
    if (fields) expect(bodyOf(response).message).toBe(`Invalid input: ${fields}`);
    expect(ddb.calls()).toHaveLength(0);
  });

  it.each(['2026-02-30', '16-11-2026', 'tomorrow'])('answers 400 for the date %s', async (date) => {
    const response = await put(date);
    expect(response.statusCode).toBe(400);
    expect(bodyOf(response)).toEqual({ error: 'invalid_request', message: 'Invalid input: date' });
    expect(ddb.calls()).toHaveLength(0);
  });

  it.each([[['user']], [[]]])('answers 403 and touches nothing for groups %j', async (groups) => {
    const response = await put(MONDAY, AC06, claimsOf('alice', groups));
    expect(response.statusCode).toBe(403);
    expect(bodyOf(response).error).toBe('forbidden');
    expect(ddb.calls()).toHaveLength(0);
  });

  it('answers 401 without an authorizer context', async () => {
    expect((await handler(eventAt(ROUTE, undefined, { date: MONDAY }, JSON.stringify(AC06)))).statusCode).toBe(401);
  });

  it('answers 409 concurrent_update when the lock stays busy', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    const pending = put(MONDAY);
    await vi.runAllTimersAsync();
    const response = await pending;
    expect(response.statusCode).toBe(409);
    expect(bodyOf(response).error).toBe('concurrent_update');
    expect(transactions()).toHaveLength(3);
  });

  it('answers 500 with a generic body when DynamoDB fails', async () => {
    ddb.on(TransactWriteCommand).rejects(new Error('secret detail'));
    const response = await put(MONDAY);
    expect(response.statusCode).toBe(500);
    expect(bodyOf(response)).toEqual({ error: 'internal_error', message: 'Could not set the override' });
  });

  it.each([[['admin']], [['user']]])('answers 500 to every caller (groups %j) when the time zone is invalid', async (groups) => {
    handler = await load('Not/AZone');
    const response = await put(MONDAY, AC06, claimsOf('alice', groups));
    expect(response.statusCode).toBe(500);
    expect(bodyOf(response).message).toBe('The calendar is not configured');
    expect(ddb.calls()).toHaveLength(0);
  });
});

// Test names: AC-… scenarios are those of docs/SHARED_CALENDAR_SPEC.md (scenarios in its section
// 18.3).
describe('setOverride handler logging (AC-36)', () => {
  it('writes one info line with the date and the lock attempts, never the windows', async () => {
    await put(MONDAY);
    expect(logLines()).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        requestId: 'req-1',
        route: ROUTE,
        username: 'admin',
        role: 'admin',
        date: MONDAY,
        lockAttempts: 1,
        outcome: 'updated',
        status: 200,
        durationMs: expect.any(Number),
      },
    ]);
    expect(output.join('')).not.toContain('windows');
    expect(output.join('')).not.toContain('"09:00"');
  });

  it('logs a conflict with conflictCount, never the conflicts or the usernames in them', async () => {
    onPartition('APPT', [aliceItem, bobItem]);
    await put(MONDAY, { windows: [] });
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'conflict', status: 409, date: MONDAY, lockAttempts: 1, conflictCount: 2 })]);
    expect(output.join('')).not.toContain('conflicts');
    expect(output.join('')).not.toContain('bob');
    expect(output.join('')).not.toContain('A1');
  });

  it('logs date_in_past with the date', async () => {
    await put(YESTERDAY);
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'conflict', status: 409, date: YESTERDAY })]);
  });

  it('logs a rejected body without echoing it', async () => {
    await put(MONDAY, { ...AC06, secretField: 'do-not-log-me' });
    expect(logLines()).toEqual([expect.objectContaining({ outcome: 'invalid_request', status: 400, date: MONDAY })]);
    expect(output.join('')).not.toContain('do-not-log-me');
  });

  it('logs a busy lock with 3 attempts, and a DynamoDB failure at error level', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    const pending = put(MONDAY);
    await vi.runAllTimersAsync();
    await pending;
    ddb.on(TransactWriteCommand).rejects(new Error('network down'));
    await put(MONDAY);
    expect(logLines()).toEqual([
      expect.objectContaining({ outcome: 'conflict', status: 409, date: MONDAY, lockAttempts: 3 }),
      expect.objectContaining({ level: 'error', status: 500, date: MONDAY, reason: { name: 'Error', message: 'network down' } }),
    ]);
  });
});
