import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  AC20_NOW,
  admin,
  APPT_ID,
  bodyOf,
  claimsOf,
  cleanUp,
  eventAt,
  harness,
  lockBusy,
  NOTE,
  STUDIO,
  storeAppointment,
  storedItem,
} from './appointmentFixtures';

type Handler = typeof import('../../../src/handlers/updateAppointmentNote').handler;
let handler: Handler;

// Editing the note (docs/SHARED_CALENDAR_SPEC.md section 8.5; docs/SHARED_CALENDAR_SPEC.md section
// 11.1, route 18; docs/SHARED_CALENDAR_SPEC.md R-NOTE-01 and R-NOTE-02).
const ROUTE = 'PATCH /calendar/appointments/{appointmentId}';
const { ddb, reset, logLines, transactions, output } = harness();
const alice = claimsOf('alice', ['user']);
const bob = claimsOf('bob', ['user']);
const NEW_NOTE = 'Bring shoes — also private';

async function load(timeZone = 'Europe/Rome'): Promise<Handler> {
  vi.stubEnv('CALENDAR_TABLE', 'calendar-test');
  vi.stubEnv('CALENDAR_TIME_ZONE', timeZone);
  vi.resetModules();
  return (await import('../../../src/handlers/updateAppointmentNote')).handler;
}
// `body` a string is sent as is; `appointmentId` null: no path parameters at all.
const patch = (body: unknown, claims: Record<string, string> | undefined = alice, appointmentId: string | null = APPT_ID) =>
  handler(eventAt(ROUTE, claims, appointmentId === null ? undefined : { appointmentId }, typeof body === 'string' ? body : JSON.stringify(body)));

beforeEach(async () => {
  reset();
  vi.setSystemTime(new Date(AC20_NOW));
  storeAppointment(ddb);
  handler = await load();
});
afterEach(cleanUp);

// Test names: R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
describe('updateAppointmentNote handler', () => {
  it('alice sets her note: 200, trimmed, cancellableUntil start − notice, typeName, no userId; one note_updated event', async () => {
    const response = await patch({ note: `  ${NEW_NOTE}  ` });
    expect(response.statusCode).toBe(200);
    const body = bodyOf(response);
    expect(body).toMatchObject({
      appointmentId: APPT_ID,
      typeId: STUDIO,
      typeName: 'Studio',
      note: NEW_NOTE,
      status: 'booked',
      updatedAt: AC20_NOW,
      updatedBy: { username: 'alice', role: 'user' },
      cancellableUntil: '2026-11-15T08:00:00.000Z',
    });
    expect(Object.keys(body)).not.toContain('userId');
    const items = transactions()[0]!.TransactItems!;
    expect(items).toHaveLength(3);
    expect(items[1]!.Update!.ExpressionAttributeValues).toMatchObject({ ':note': NEW_NOTE, ':version': 2 });
    expect(items[2]!.Put!.Item).toMatchObject({ type: 'appointment.note_updated', appointment: { note: NEW_NOTE } });
  });

  it('the Administrator edits it: cancellableUntil null', async () => {
    const response = await patch({ note: NEW_NOTE }, admin);
    expect(response.statusCode).toBe(200);
    expect(bodyOf(response)).toMatchObject({ note: NEW_NOTE, updatedBy: { username: 'admin', role: 'admin' }, cancellableUntil: null });
  });

  it.each([
    ['null', null],
    ['an empty note', ''],
    ['spaces', '   '],
  ])('%s clears the note', async (_name, note) => {
    expect(bodyOf(await patch({ note })).note).toBeNull();
    expect(transactions()[0]!.TransactItems![1]!.Update!.ExpressionAttributeValues![':note']).toBeNull();
  });

  it('a note equal to the stored one (after trimming) is 200 with nothing written', async () => {
    const response = await patch({ note: `${NOTE}  ` });
    expect(response.statusCode).toBe(200);
    expect(bodyOf(response)).toMatchObject({ note: NOTE, updatedAt: '2026-11-10T09:00:00.000Z' });
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
    expect(logLines()[0]).toMatchObject({ outcome: 'unchanged', status: 200, appointmentId: APPT_ID, lockAttempts: 1 });
  });

  it('the log line: appointmentId, outcome, attempts; never the note, the body or a sub (R-NOTE-02)', async () => {
    await patch({ note: NEW_NOTE });
    expect(logLines()).toEqual([
      {
        level: 'info',
        requestId: 'req-1',
        route: ROUTE,
        username: 'alice',
        role: 'user',
        appointmentId: APPT_ID,
        lockAttempts: 1,
        outcome: 'updated',
        status: 200,
        durationMs: expect.any(Number),
        timestamp: AC20_NOW,
      },
    ]);
    const all = output.join('');
    expect(all).not.toContain(NEW_NOTE);
    expect(all).not.toContain(NOTE);
    expect(all).not.toContain('sub-alice');
  });

  it('bob editing alice’s note is 404 appointment_not_found (R-PERM-01), nothing written', async () => {
    const response = await patch({ note: 'x' }, bob);
    expect(response.statusCode).toBe(404);
    expect(bodyOf(response)).toEqual({ error: 'appointment_not_found', message: 'No appointment with this id' });
    expect(transactions()).toHaveLength(0);
  });

  it('an unknown id is 404', async () => {
    ddb.on(GetCommand, { Key: { PK: `APPTID#${APPT_ID}`, SK: 'APPTID' } }).resolves({});
    expect((await patch({ note: 'x' }, admin)).statusCode).toBe(404);
  });

  it('a cancelled or an ended appointment is 409 appointment_not_active, for both roles', async () => {
    storeAppointment(ddb, storedItem({ status: 'cancelled' }));
    for (const claims of [alice, admin]) expect(bodyOf(await patch({ note: 'x' }, claims))).toMatchObject({ error: 'appointment_not_active' });
    storeAppointment(ddb);
    vi.setSystemTime(new Date('2026-11-16T09:00:00.000Z'));
    const response = await patch({ note: 'x' }, admin);
    expect(response.statusCode).toBe(409);
    expect(logLines().at(-1)).toMatchObject({ outcome: 'conflict', status: 409 });
  });

  it('no notice applies: alice edits her appointment in progress', async () => {
    vi.setSystemTime(new Date('2026-11-16T08:30:00.000Z'));
    expect((await patch({ note: 'x' })).statusCode).toBe(200);
  });

  it('accepts 500 UTF-16 units', async () => {
    expect((await patch({ note: 'a'.repeat(500) })).statusCode).toBe(200);
  });

  it.each([
    ['invalid JSON', '{"note":', 'invalid_json'],
    ['501 UTF-16 units', { note: 'a'.repeat(499) + '😀' }, 'invalid_request'],
    ['a control character', { note: 'a\tb' }, 'invalid_request'],
    ['an unknown field', { note: 'x', status: 'cancelled' }, 'invalid_request'],
    ['note missing', {}, 'invalid_request'],
    ['a note that is not a string', { note: 5 }, 'invalid_request'],
  ])('400 for %s, with nothing touched and the body not logged', async (_name, body, code) => {
    const response = await patch(body);
    expect(response.statusCode).toBe(400);
    expect(bodyOf(response)).toMatchObject({ error: code });
    expect(ddb.calls()).toHaveLength(0);
    expect(logLines()[0]).toMatchObject({ outcome: 'invalid_request', appointmentId: APPT_ID });
    expect(output.join('')).not.toContain('aaaa');
  });

  it('400 for an id that is not a ULID or is missing, before the body', async () => {
    for (const id of ['nope', null]) {
      const response = await patch('{"note":', alice, id);
      expect(response.statusCode).toBe(400);
      expect(bodyOf(response)).toMatchObject({ error: 'invalid_request' });
    }
    expect(ddb.calls()).toHaveLength(0);
  });

  it('403 forbidden for a token in neither group; 401 without claims', async () => {
    expect((await patch({ note: 'x' }, claimsOf('carol', []))).statusCode).toBe(403);
    expect((await handler(eventAt(ROUTE, undefined, { appointmentId: APPT_ID }, '{"note":null}'))).statusCode).toBe(401);
    expect(ddb.calls()).toHaveLength(0);
  });

  it('500 for every role when the time zone is broken', async () => {
    handler = await load('Not/AZone');
    for (const claims of [alice, admin, claimsOf('carol', [])]) {
      const response = await patch({ note: 'x' }, claims);
      expect(response.statusCode).toBe(500);
      expect(bodyOf(response)).toEqual({ error: 'internal_error', message: 'The calendar is not configured' });
    }
  });

  it('409 concurrent_update after three lost attempts', async () => {
    ddb.on(TransactWriteCommand).rejects(lockBusy());
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const pending = patch({ note: 'x' });
    await vi.runAllTimersAsync();
    const response = await pending;
    expect(response.statusCode).toBe(409);
    expect(bodyOf(response)).toEqual({ error: 'concurrent_update', message: 'The calendar is busy; try again' });
    expect(logLines()[0]).toMatchObject({ lockAttempts: 3, appointmentId: APPT_ID });
  });

  it('500 internal_error when DynamoDB fails', async () => {
    ddb.on(TransactWriteCommand).rejects(new Error('boom'));
    const response = await patch({ note: 'x' });
    expect(response.statusCode).toBe(500);
    expect(bodyOf(response)).toEqual({ error: 'internal_error', message: 'Could not update the note' });
  });
});
