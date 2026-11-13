import { addDays, localDateOf, toInstant, weekdayOf } from '@shared-calendar/shared';
import { ulid } from 'ulid';
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

// The ids the API gave each type, filled by the type journeys and used by the pattern journeys.
const ids: Record<string, string> = {};

describe('availability types (routes 3–6)', () => {
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
});

describe('weekly patterns (routes 7–10)', () => {
  // The scenario's pattern (AC-04): Monday 08:00–12:00 at Studio from 2026-11-01, no end. A pattern
  // may start in the past (A4), and no appointment exists before step 48, so fixed dates work.
  const ac04 = () => ({ weekday: 1, start: '08:00', end: '12:00', typeId: ids.Studio, validFrom: '2026-11-01', validUntil: null });
  const created: Record<string, string> = {};
  const listed = async () => {
    const res = await api('GET', '/calendar/patterns', adminToken);
    expect(res.status).toBe(200);
    return res.body?.patterns as { patternId: string; weekday: number; start: string; end: string }[];
  };

  it('starts with no pattern; a User can neither list nor create (403)', async () => {
    expect(await listed()).toEqual([]);
    expect((await api('GET', '/calendar/patterns', aliceToken)).status).toBe(403);
    const post = await api('POST', '/calendar/patterns', aliceToken, ac04());
    expect(post.status).toBe(403);
    expect(post.body).toMatchObject({ error: 'forbidden' });
  });

  it('creates the AC-04 pattern (201), stored with every field of 13.2', async () => {
    const res = await api('POST', '/calendar/patterns', adminToken, ac04());
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ patternId: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/), ...ac04(), createdAt: expect.any(String), updatedAt: expect.any(String) });
    created.ac04 = res.body?.patternId as string;
    expect(await getCalendarItem('PATTERN', created.ac04)).toEqual({
      PK: 'PATTERN',
      SK: created.ac04,
      ...ac04(),
      createdAt: res.body?.createdAt,
      updatedAt: res.body?.updatedAt,
    });
  });

  it('AC-05: Mon 11:00–13:00 at the other type, same validity, is 409 availability_overlap', async () => {
    const res = await api('POST', '/calendar/patterns', adminToken, { ...ac04(), start: '11:00', end: '13:00', typeId: ids.pool });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'availability_overlap',
      message: 'On 2026-11-02 the window 11:00–13:00 would overlap the window 08:00–12:00',
    });
    expect(await listed()).toHaveLength(1);
  });

  it('allows a touching window, and lists by weekday, then start', async () => {
    for (const [name, body] of [
      ['touching', { ...ac04(), start: '12:00', end: '13:00', typeId: ids.pool }],
      ['tuesday', { ...ac04(), weekday: 2, start: '09:00', end: '10:00' }],
      ['early', { ...ac04(), start: '07:00', end: '08:00', typeId: ids.pool }],
    ] as const) {
      const res = await api('POST', '/calendar/patterns', adminToken, body);
      expect(res.status).toBe(201);
      created[name] = res.body?.patternId as string;
    }
    expect((await listed()).map((p) => p.patternId)).toEqual([created.early, created.ac04, created.touching, created.tuesday]);
  });

  it('an unknown typeId in the body is 409 type_not_found', async () => {
    const res = await api('POST', '/calendar/patterns', adminToken, { ...ac04(), weekday: 3, typeId: ulid() });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'type_not_found' });
  });

  it('updates as a full replacement (200, createdAt kept); a field left out is 400; an overlap is 409', async () => {
    const before = await getCalendarItem('PATTERN', created.touching!);
    const res = await api('PUT', `/calendar/patterns/${created.touching}`, adminToken, { ...ac04(), start: '12:00', end: '14:00', validUntil: '2026-12-31' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ patternId: created.touching, start: '12:00', end: '14:00', typeId: ids.Studio, validUntil: '2026-12-31' });
    expect(res.body?.createdAt).toBe(before?.createdAt);

    // Every field is required: one left out is refused, never "kept" from the stored pattern.
    const missing: Record<string, unknown> = { ...ac04(), start: '12:00', end: '14:00' };
    delete missing.validUntil;
    const partial = await api('PUT', `/calendar/patterns/${created.touching}`, adminToken, missing);
    expect(partial.status).toBe(400);
    expect(partial.body).toMatchObject({ error: 'invalid_request' });

    const clash = await api('PUT', `/calendar/patterns/${created.touching}`, adminToken, { ...ac04(), start: '11:30', end: '14:00' });
    expect(clash.status).toBe(409);
    expect(clash.body).toMatchObject({ error: 'availability_overlap' });
    expect(await getCalendarItem('PATTERN', created.touching!)).toMatchObject({ start: '12:00', end: '14:00', validUntil: '2026-12-31' });
  });

  it('an unknown pattern id is 404 pattern_not_found; a malformed one is 400', async () => {
    const unknown = ulid();
    for (const res of [
      await api('PUT', `/calendar/patterns/${unknown}`, adminToken, ac04()),
      await api('DELETE', `/calendar/patterns/${unknown}`, adminToken),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ error: 'pattern_not_found' });
    }
    expect((await api('DELETE', '/calendar/patterns/not-a-ulid', adminToken)).status).toBe(400);
  });

  it('AC-28: a type used by patterns is 409 type_in_use; once they are deleted (204) the type deletes (204)', async () => {
    const inUse = await api('DELETE', `/calendar/types/${ids.Studio}`, adminToken);
    expect(inUse.status).toBe(409);
    expect(inUse.body).toMatchObject({ error: 'type_in_use' });

    for (const name of ['ac04', 'touching', 'tuesday']) {
      const res = await api('DELETE', `/calendar/patterns/${created[name]}`, adminToken);
      expect(res.status).toBe(204);
      expect(res.body).toBeUndefined();
    }
    expect((await listed()).map((p) => p.patternId)).toEqual([created.early]);

    const gone = await api('DELETE', `/calendar/types/${ids.Studio}`, adminToken);
    expect(gone.status).toBe(204);
    expect(await getCalendarItem('TYPE', ids.Studio!)).toBeUndefined();
  });
});

describe('calendar view (route 15)', () => {
  // Dates come from the real today in the calendar zone, computed with the shared helpers, never
  // with fixed offsets. The settings journeys left minBookingNoticeHours 2 and bookingHorizonDays 30;
  // the type journeys left GYM (ids.pool) with the pattern Monday 07:00–08:00 from 2026-11-01.
  const ZONE = 'Europe/Rome';
  const HOUR_MS = 60 * 60 * 1000;
  const today = () => localDateOf(new Date().toISOString(), ZONE);
  const firstOnOrAfter = (date: string, weekday: number) => {
    let d = date;
    while (weekdayOf(d) !== weekday) d = addDays(d, 1);
    return d;
  };
  const at = (date: string, time: string) => toInstant(date, time, ZONE);
  const view = async (token: string, from: string, to: string) => {
    const res = await api('GET', `/calendar?from=${from}&to=${to}`, token);
    expect(res.status).toBe(200);
    return res.body as { timeZone: string; from: string; to: string; generatedAt: string; days: Record<string, unknown>[]; appointments: unknown[] };
  };
  type Window = { start: string; end: string; typeId: string; typeName: string; source?: string; sourceId?: string };
  type Slot = { start: string; end: string; typeId: string };
  const patternIds: Record<string, string> = {};

  it('prepares a fresh Studio type and the AC-04 pattern, from a past Monday, no end', async () => {
    const type = await api('POST', '/calendar/types', adminToken, { name: 'Studio' });
    expect(type.status).toBe(201);
    ids.viewStudio = type.body?.typeId as string;

    const pastMonday = addDays(firstOnOrAfter(today(), 1), -14);
    const res = await api('POST', '/calendar/patterns', adminToken, {
      weekday: 1, start: '08:00', end: '12:00', typeId: ids.viewStudio, validFrom: pastMonday, validUntil: null,
    });
    expect(res.status).toBe(201);
    patternIds.ac04 = res.body?.patternId as string;

    const patterns = await api('GET', '/calendar/patterns', adminToken);
    const gym = (patterns.body?.patterns as { patternId: string; typeId: string }[]).find((p) => p.typeId === ids.pool);
    expect(gym).toBeDefined();
    patternIds.gym = gym!.patternId;
  });

  it('AC-04: alice sees the next Monday at least 8 days ahead: the window 08:00–12:00 and slots at 08, 09, 10, 11; no admin-only field', async () => {
    const D = firstOnOrAfter(addDays(today(), 8), 1);
    const before = Date.now();
    const body = await view(aliceToken, D, D);
    expect(body).toMatchObject({ timeZone: ZONE, from: D, to: D, appointments: [] });
    expect(Date.parse(body.generatedAt)).toBeGreaterThanOrEqual(before - 5_000);
    expect(body.days).toHaveLength(1);

    const day = body.days[0]!;
    expect(day).toEqual({
      date: D,
      weekday: 1,
      // The leftover GYM window touches the Studio window and stays apart: another type.
      windows: [
        { start: at(D, '07:00'), end: at(D, '08:00'), typeId: ids.pool, typeName: 'GYM' },
        { start: at(D, '08:00'), end: at(D, '12:00'), typeId: ids.viewStudio, typeName: 'Studio' },
      ],
      slots: [
        { start: at(D, '07:00'), end: at(D, '08:00'), typeId: ids.pool },
        ...['08:00', '09:00', '10:00', '11:00'].map((t, i) => ({
          start: at(D, t),
          end: at(D, ['09:00', '10:00', '11:00', '12:00'][i]!),
          typeId: ids.viewStudio,
        })),
      ],
      busy: [],
    });
    // Absent for a User, not null or false.
    expect('hasOverride' in day).toBe(false);
    for (const w of day.windows as Window[]) {
      expect('source' in w).toBe(false);
      expect('sourceId' in w).toBe(false);
    }
  });

  it('AC-04: the Administrator’s view of the same day carries source, sourceId and hasOverride', async () => {
    const D = firstOnOrAfter(addDays(today(), 8), 1);
    const day = (await view(adminToken, D, D)).days[0]!;
    expect(day.hasOverride).toBe(false);
    expect(day.busy).toEqual([]);
    expect(day.windows).toEqual([
      { start: at(D, '07:00'), end: at(D, '08:00'), typeId: ids.pool, typeName: 'GYM', source: 'pattern', sourceId: patternIds.gym },
      { start: at(D, '08:00'), end: at(D, '12:00'), typeId: ids.viewStudio, typeName: 'Studio', source: 'pattern', sourceId: patternIds.ac04 },
    ]);
    expect((day.slots as Slot[]).map((s) => s.start)).toEqual(['07:00', '08:00', '09:00', '10:00', '11:00'].map((t) => at(D, t)));
  });

  it('AC-33: a range of more than 31 days, from after to, a missing to and an unknown parameter are 400 invalid_request, for both roles', async () => {
    for (const token of [aliceToken, adminToken]) {
      for (const query of [
        'from=2026-11-01&to=2026-12-15',
        'from=2026-11-17&to=2026-11-16',
        'from=2026-11-16',
        'from=2026-11-16&to=2026-11-16&username=bob',
        'from=2026-02-30&to=2026-03-01',
      ]) {
        const res = await api('GET', `/calendar?${query}`, token);
        expect(res.status, query).toBe(400);
        expect(res.body).toMatchObject({ error: 'invalid_request' });
      }
      // 31 days is allowed, to both roles.
      const from = today();
      expect((await view(token, from, addDays(from, 30))).days).toHaveLength(31);
    }
  });

  it('AC-35: on the next spring-forward Sunday, 01:00–04:00 gives the Administrator slots at 01:00 and 03:00 local, each 60 real minutes', async () => {
    // The next Sunday on which local 01:00 and 03:00 are one real hour apart.
    let S = firstOnOrAfter(today(), 7);
    for (let i = 0; i < 60 && Date.parse(at(S, '03:00')) - Date.parse(at(S, '01:00')) !== HOUR_MS; i++) S = addDays(S, 7);
    expect(Date.parse(at(S, '03:00')) - Date.parse(at(S, '01:00'))).toBe(HOUR_MS);

    const res = await api('POST', '/calendar/patterns', adminToken, {
      weekday: 7, start: '01:00', end: '04:00', typeId: ids.viewStudio, validFrom: S, validUntil: S,
    });
    expect(res.status).toBe(201);

    const admin = (await view(adminToken, S, S)).days[0]!;
    expect(admin.windows).toEqual([
      { start: at(S, '01:00'), end: at(S, '04:00'), typeId: ids.viewStudio, typeName: 'Studio', source: 'pattern', sourceId: res.body?.patternId },
    ]);
    const slots = admin.slots as Slot[];
    expect(slots).toEqual([
      { start: at(S, '01:00'), end: at(S, '03:00'), typeId: ids.viewStudio },
      { start: at(S, '03:00'), end: at(S, '04:00'), typeId: ids.viewStudio },
    ]);
    for (const s of slots) expect(Date.parse(s.end) - Date.parse(s.start)).toBe(HOUR_MS);

    // alice: the same window; slots only if S lies within the 30-day horizon (R-SLOT-03).
    const alice = (await view(aliceToken, S, S)).days[0]!;
    expect(alice.windows).toEqual([{ start: at(S, '01:00'), end: at(S, '04:00'), typeId: ids.viewStudio, typeName: 'Studio' }]);
    expect(alice.slots).toEqual(S > addDays(today(), 30) ? [] : slots);
  });
});
