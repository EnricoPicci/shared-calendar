import { ulid } from 'ulid';
import { api, getCalendarItem, putCalendarItem, resetCalendarTable, signIn } from './setup';

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

describe('availability types (routes 3–6)', () => {
  // Filled as the journeys go: the ids the API gave each type.
  const ids: Record<string, string> = {};
  const listNames = async (token: string) => {
    const res = await api('GET', '/calendar/types', token);
    expect(res.status).toBe(200);
    return (res.body?.types as { name: string }[]).map((t) => t.name);
  };

  it('starts with no type', async () => {
    expect(await listNames(adminToken)).toEqual([]);
  });

  it('the Administrator creates two types (201), stored with their nameKey', async () => {
    for (const name of ['Studio', 'pool']) {
      const res = await api('POST', '/calendar/types', adminToken, { name: `  ${name} ` });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ typeId: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/), name, createdAt: expect.any(String), updatedAt: expect.any(String) });
      expect(res.body?.createdAt).toBe(res.body?.updatedAt);
      ids[name] = res.body?.typeId as string;
    }
    expect(await getCalendarItem('TYPE', ids.Studio!)).toEqual({
      PK: 'TYPE',
      SK: ids.Studio,
      name: 'Studio',
      nameKey: 'studio',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('AC-03: "studio" while "Studio" exists is 409 type_name_exists', async () => {
    const res = await api('POST', '/calendar/types', adminToken, { name: 'studio' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'type_name_exists' });
    expect(await listNames(adminToken)).toHaveLength(2);
  });

  it('the list is sorted by name, case-insensitively, and the same for the Administrator and a User', async () => {
    expect(await listNames(adminToken)).toEqual(['pool', 'Studio']);
    const asAdmin = await api('GET', '/calendar/types', adminToken);
    const asAlice = await api('GET', '/calendar/types', aliceToken);
    expect(asAlice.status).toBe(200);
    expect(asAlice.body).toEqual(asAdmin.body);
  });

  it('a User cannot create, rename or delete a type (403)', async () => {
    const post = await api('POST', '/calendar/types', aliceToken, { name: 'Gym' });
    expect(post.status).toBe(403);
    expect(post.body).toMatchObject({ error: 'forbidden' });
    expect((await api('PUT', `/calendar/types/${ids.pool}`, aliceToken, { name: 'Gym' })).status).toBe(403);
    expect((await api('DELETE', `/calendar/types/${ids.pool}`, aliceToken)).status).toBe(403);
    expect(await listNames(adminToken)).toEqual(['pool', 'Studio']);
  });

  it('renames a type (200), also to its own name in another case; another type’s name is 409', async () => {
    const gym = await api('PUT', `/calendar/types/${ids.pool}`, adminToken, { name: 'Gym' });
    expect(gym.status).toBe(200);
    expect(gym.body).toMatchObject({ typeId: ids.pool, name: 'Gym' });
    expect(Date.parse(gym.body?.updatedAt as string)).toBeGreaterThanOrEqual(Date.parse(gym.body?.createdAt as string));

    const recased = await api('PUT', `/calendar/types/${ids.pool}`, adminToken, { name: 'GYM' });
    expect(recased.status).toBe(200);
    expect(recased.body?.name).toBe('GYM');

    const taken = await api('PUT', `/calendar/types/${ids.pool}`, adminToken, { name: 'studio' });
    expect(taken.status).toBe(409);
    expect(taken.body).toMatchObject({ error: 'type_name_exists' });

    expect(await listNames(aliceToken)).toEqual(['GYM', 'Studio']);
  });

  it('an unknown id is 404 type_not_found; a malformed one is 400', async () => {
    const unknown = ulid();
    for (const res of [
      await api('PUT', `/calendar/types/${unknown}`, adminToken, { name: 'Nowhere' }),
      await api('DELETE', `/calendar/types/${unknown}`, adminToken),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ error: 'type_not_found' });
    }
    const malformed = await api('DELETE', '/calendar/types/not-a-ulid', adminToken);
    expect(malformed.status).toBe(400);
    expect(malformed.body).toMatchObject({ error: 'invalid_request' });
  });

  it('deletes an unused type (204), which is then gone', async () => {
    const created = await api('POST', '/calendar/types', adminToken, { name: 'Temporary' });
    expect(created.status).toBe(201);
    const typeId = created.body?.typeId as string;

    const res = await api('DELETE', `/calendar/types/${typeId}`, adminToken);
    expect(res.status).toBe(204);
    expect(res.body).toBeUndefined();
    expect(await listNames(adminToken)).toEqual(['GYM', 'Studio']);
    expect(await getCalendarItem('TYPE', typeId)).toBeUndefined();
    expect((await api('DELETE', `/calendar/types/${typeId}`, adminToken)).status).toBe(404);
  });

  it('AC-28: a type used by a weekly pattern is 409 type_in_use, and stays', async () => {
    // Patterns have no route before plan step 45: the item is written directly, with only the
    // attributes of spec 13.2 that the delete check reads.
    await putCalendarItem({ PK: 'PATTERN', SK: ulid(), typeId: ids.Studio });
    const res = await api('DELETE', `/calendar/types/${ids.Studio}`, adminToken);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'type_in_use' });
    expect(await getCalendarItem('TYPE', ids.Studio!)).toMatchObject({ name: 'Studio' });
  });
});
