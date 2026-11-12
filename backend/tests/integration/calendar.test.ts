import { api, getCalendarItem, resetCalendarTable, signIn } from './setup';

// The shared calendar's journeys (docs/SHARED_CALENDAR_SPEC.md 18.2), end to end through sam
// local. Each route step adds its own. The calendar is global, so this file owns the local
// calendar table: it empties it first and never relies on another file having run.
//
// Secrets: tokens stay in variables; assertions look at their length only.

const ADMIN_PASSWORD = 'Admin-Local-Pass-1!';
const ALICE_PASSWORD = 'Alice-Local-Pass-1!';

const DEFAULTS = {
  timeZone: 'Europe/Rome',
  cancellationNoticeHours: 24,
  minBookingNoticeHours: 0,
  bookingHorizonDays: 56,
  maxFutureAppointmentsPerUser: null,
  updatedAt: null,
  updatedBy: null,
};
const NEW_VALUES = { cancellationNoticeHours: 48, minBookingNoticeHours: 2, bookingHorizonDays: 30, maxFutureAppointmentsPerUser: 3 };

let adminToken: string;
let aliceToken: string;

beforeAll(async () => {
  await resetCalendarTable();
  adminToken = await signIn('admin', ADMIN_PASSWORD);
  aliceToken = await signIn('alice', ALICE_PASSWORD);
  expect(adminToken.length).toBeGreaterThan(100);
  expect(aliceToken.length).toBeGreaterThan(100);
});

describe('calendar settings (routes 1 and 2)', () => {
  it('AC-01: before any save, everyone reads the defaults in Europe/Rome with updatedAt null', async () => {
    for (const token of [aliceToken, adminToken]) {
      const res = await api('GET', '/calendar/settings', token);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(DEFAULTS);
    }
    // The defaults are not written anywhere (R-SET-01).
    expect(await getCalendarItem('SETTINGS', 'SETTINGS')).toBeUndefined();
  });

  it('AC-02: a User PUT is 403 forbidden and changes nothing', async () => {
    const res = await api('PUT', '/calendar/settings', aliceToken, NEW_VALUES);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'forbidden' });
    expect(await getCalendarItem('SETTINGS', 'SETTINGS')).toBeUndefined();
    expect(await getCalendarItem('LOCK', 'LOCK')).toBeUndefined();
  });

  it('an invalid body is 400 invalid_request and changes nothing', async () => {
    const res = await api('PUT', '/calendar/settings', adminToken, { ...NEW_VALUES, timeZone: 'Asia/Tokyo' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_request' });
    expect(await getCalendarItem('SETTINGS', 'SETTINGS')).toBeUndefined();
  });

  it('the Administrator saves the settings, and everyone reads them back', async () => {
    const before = Date.now();
    const put = await api('PUT', '/calendar/settings', adminToken, NEW_VALUES);
    expect(put.status).toBe(200);
    expect(put.body).toEqual({
      timeZone: 'Europe/Rome',
      ...NEW_VALUES,
      updatedAt: expect.any(String),
      updatedBy: { username: 'admin', role: 'admin' },
    });
    const updatedAt = Date.parse(put.body?.updatedAt as string);
    expect(updatedAt).toBeGreaterThanOrEqual(before - 5_000);
    expect(updatedAt).toBeLessThanOrEqual(Date.now() + 5_000);

    for (const token of [aliceToken, adminToken]) {
      const get = await api('GET', '/calendar/settings', token);
      expect(get.status).toBe(200);
      expect(get.body).toEqual(put.body);
    }
    // First use of the lock: the transaction created it at version 1 (spec 13.4).
    expect(await getCalendarItem('LOCK', 'LOCK')).toEqual({ PK: 'LOCK', SK: 'LOCK', version: 1 });
  });

  it('a second save replaces all four values and moves the lock on to version 2', async () => {
    const unlimited = { ...NEW_VALUES, maxFutureAppointmentsPerUser: null };
    const put = await api('PUT', '/calendar/settings', adminToken, unlimited);
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject(unlimited);

    const get = await api('GET', '/calendar/settings', aliceToken);
    expect(get.body).toEqual(put.body);
    expect(await getCalendarItem('LOCK', 'LOCK')).toEqual({ PK: 'LOCK', SK: 'LOCK', version: 2 });
  });
});
