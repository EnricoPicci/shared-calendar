import { addDays, localDateOf, toInstant, weekdayOf } from '@shared-calendar/shared';
import { ulid } from 'ulid';
import {
  api,
  deleteCalendarItem,
  getCalendarItem,
  putCalendarItem,
  queryCalendarPartition,
  removeUserIfPresent,
  resetCalendarTable,
  signIn,
} from './setup';

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

// Test names: AC-… scenarios and route numbers are those of docs/SHARED_CALENDAR_SPEC.md (scenarios
// in its section 18.3, routes in its section 11.1).
describe('calendar settings (routes 1 and 2)', () => {
  it('AC-01: before any save, everyone reads the defaults in Europe/Rome with updatedAt null', async () => {
    for (const token of [aliceToken, adminToken]) {
      const res = await api('GET', '/calendar/settings', token);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(DEFAULTS);
    }
    // The defaults are not written anywhere (docs/SHARED_CALENDAR_SPEC.md R-SET-01).
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
    // First use of the lock: the transaction created it at version 1 (docs/SHARED_CALENDAR_SPEC.md
    // section 13.4).
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

// Test names: AC-… scenarios and route numbers are those of docs/SHARED_CALENDAR_SPEC.md (scenarios
// in its section 18.3, routes in its section 11.1).
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

// Test names: section numbers, AC-… scenarios and route numbers are those of
// docs/SHARED_CALENDAR_SPEC.md (scenarios in its section 18.3, routes in its section 11.1).
describe('weekly patterns (routes 7–10)', () => {
  // The scenario's pattern (docs/SHARED_CALENDAR_SPEC.md AC-04): Monday 08:00–12:00 at Studio from
  // 2026-11-01, no end. A pattern may start in the past (docs/SHARED_CALENDAR_SPEC.md section 22,
  // assumption A4), and no appointment exists yet when these journeys run, so fixed dates work.
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

// Test names: AC-… scenarios and route numbers are those of docs/SHARED_CALENDAR_SPEC.md (scenarios
// in its section 18.3, routes in its section 11.1).
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

    // alice: the same window; slots only if S lies within the 30-day horizon
    // (docs/SHARED_CALENDAR_SPEC.md R-SLOT-03).
    const alice = (await view(aliceToken, S, S)).days[0]!;
    expect(alice.windows).toEqual([{ start: at(S, '01:00'), end: at(S, '04:00'), typeId: ids.viewStudio, typeName: 'Studio' }]);
    expect(alice.slots).toEqual(S > addDays(today(), 30) ? [] : slots);
  });
});

// Test names: section numbers, AC-… scenarios and route numbers are those of
// docs/SHARED_CALENDAR_SPEC.md (scenarios in its section 18.3, routes in its section 11.1).
describe('date overrides and one-off windows (routes 11–14)', () => {
  // Builds on what the earlier journeys leave: GYM (ids.pool) with the pattern Monday 07:00–08:00
  // from 2026-11-01, Studio (ids.viewStudio) with the pattern Monday 08:00–12:00 from a past Monday
  // (both open-ended), and settings minBookingNoticeHours 2, bookingHorizonDays 30. No override, no
  // one-off window and no appointment yet. Dates come from the real today in the calendar zone,
  // computed with the shared helpers; D is the next Monday at least 8 days ahead, as in the view.
  const ZONE = 'Europe/Rome';
  const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
  const today = () => localDateOf(new Date().toISOString(), ZONE);
  const nextMonday = (from: string) => {
    let d = from;
    while (weekdayOf(d) !== 1) d = addDays(d, 1);
    return d;
  };
  const D = () => nextMonday(addDays(today(), 8));
  const at = (date: string, time: string) => toInstant(date, time, ZONE);
  type Window = { start: string; end: string; typeId: string; typeName: string; source?: string; sourceId?: string };
  type Day = { date: string; windows: Window[]; slots: { start: string }[]; hasOverride?: boolean };
  const dayOf = async (token: string, date: string): Promise<Day> => {
    const res = await api('GET', `/calendar?from=${date}&to=${date}`, token);
    expect(res.status).toBe(200);
    return (res.body?.days as Day[])[0]!;
  };
  // The two pattern windows every Monday has without an override.
  const mondayWindows = (date: string) => [
    { start: at(date, '07:00'), end: at(date, '08:00'), typeId: ids.pool, typeName: 'GYM', source: 'pattern', sourceId: expect.any(String) },
    { start: at(date, '08:00'), end: at(date, '12:00'), typeId: ids.viewStudio, typeName: 'Studio', source: 'pattern', sourceId: expect.any(String) },
  ];
  const windowIds: Record<string, string> = {};

  it('AC-06: an override on D [09:00–12:00 Studio] is 200; D shows that one window, D + 7 is unchanged', async () => {
    const date = D();
    const studio = { start: '09:00', end: '12:00', typeId: ids.viewStudio };
    const res = await api('PUT', `/calendar/overrides/${date}`, adminToken, { windows: [studio] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ date, windows: [studio], updatedAt: expect.any(String) });
    // Stored with updatedBy, which the answer leaves out (docs/ARCHITECTURE.md section 5.3).
    expect(await getCalendarItem('OVERRIDE', date)).toEqual({
      PK: 'OVERRIDE',
      SK: date,
      windows: [studio],
      updatedAt: res.body?.updatedAt,
      updatedBy: { username: 'admin', role: 'admin' },
    });

    const day = await dayOf(adminToken, date);
    expect(day.hasOverride).toBe(true);
    // No GYM window: the override replaces every pattern window of its date
    // (docs/SHARED_CALENDAR_SPEC.md R-OVR-01).
    expect(day.windows).toEqual([
      { start: at(date, '09:00'), end: at(date, '12:00'), typeId: ids.viewStudio, typeName: 'Studio', source: 'override', sourceId: date },
    ]);
    const next = await dayOf(adminToken, addDays(date, 7));
    expect(next.hasOverride).toBe(false);
    expect(next.windows).toEqual(mondayWindows(addDays(date, 7)));
  });

  it('AC-07: an empty override on D + 7 closes that Monday; hasOverride for the Administrator only', async () => {
    const date = addDays(D(), 7);
    const res = await api('PUT', `/calendar/overrides/${date}`, adminToken, { windows: [] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ date, windows: [], updatedAt: expect.any(String) });

    const admin = await dayOf(adminToken, date);
    expect(admin).toMatchObject({ windows: [], slots: [], hasOverride: true });
    const alice = await dayOf(aliceToken, date);
    expect(alice).toMatchObject({ windows: [], slots: [] });
    expect('hasOverride' in alice).toBe(false);
  });

  it('AC-08: a one-off window 12:00–13:00 Studio on D + 14 shows as its own window, and the merged window offers 11:00 and 12:00', async () => {
    const date = addDays(D(), 14);
    const body = { date, start: '12:00', end: '13:00', typeId: ids.viewStudio };
    const res = await api('POST', '/calendar/windows', adminToken, body);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ windowId: expect.stringMatching(ULID), ...body, createdAt: expect.any(String) });
    windowIds.ac08 = res.body?.windowId as string;
    expect(await getCalendarItem('WINDOW', `${date}#${windowIds.ac08}`)).toEqual({
      PK: 'WINDOW',
      SK: `${date}#${windowIds.ac08}`,
      ...body,
      createdAt: res.body?.createdAt,
      createdBy: { username: 'admin', role: 'admin' },
    });

    const day = await dayOf(adminToken, date);
    // Not merged in `windows` (docs/SHARED_CALENDAR_SPEC.md decision T11).
    expect(day.windows).toEqual([
      ...mondayWindows(date),
      { start: at(date, '12:00'), end: at(date, '13:00'), typeId: ids.viewStudio, typeName: 'Studio', source: 'one_off', sourceId: windowIds.ac08 },
    ]);
    // The effective window 08:00–13:00 Studio: 11:00–12:00 and 12:00–13:00 are both slots.
    expect(day.slots.map((s) => s.start)).toEqual(['07:00', '08:00', '09:00', '10:00', '11:00', '12:00'].map((t) => at(date, t)));
  });

  it('AC-09: a one-off window 11:00–12:30 on a Monday with the patterns is 409 availability_overlap', async () => {
    const date = addDays(D(), 14);
    const res = await api('POST', '/calendar/windows', adminToken, { date, start: '11:00', end: '12:30', typeId: ids.pool });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'availability_overlap',
      message: `On ${date} the window 08:00–12:00 would overlap the window 11:00–12:30`,
    });
    expect((await dayOf(adminToken, date)).windows).toHaveLength(3);
  });

  it('deleting the AC-06 override (204) brings the patterns back on D; deleting it again is 404 override_not_found', async () => {
    const date = D();
    const res = await api('DELETE', `/calendar/overrides/${date}`, adminToken);
    expect(res.status).toBe(204);
    expect(res.body).toBeUndefined();
    expect(await getCalendarItem('OVERRIDE', date)).toBeUndefined();
    const day = await dayOf(adminToken, date);
    expect(day.hasOverride).toBe(false);
    expect(day.windows).toEqual(mondayWindows(date));

    const again = await api('DELETE', `/calendar/overrides/${date}`, adminToken);
    expect(again.status).toBe(404);
    expect(again.body).toMatchObject({ error: 'override_not_found' });
  });

  it('deleting an override whose returning pattern window overlaps a one-off window of the date is 409 availability_overlap (6.5)', async () => {
    const date = addDays(D(), 21);
    expect((await api('PUT', `/calendar/overrides/${date}`, adminToken, { windows: [] })).status).toBe(200);
    // Allowed: the base of the date is empty.
    const added = await api('POST', '/calendar/windows', adminToken, { date, start: '09:00', end: '10:00', typeId: ids.pool });
    expect(added.status).toBe(201);

    const res = await api('DELETE', `/calendar/overrides/${date}`, adminToken);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'availability_overlap',
      message: `On ${date} the window 08:00–12:00 would overlap the window 09:00–10:00`,
    });
    const day = await dayOf(adminToken, date);
    expect(day.hasOverride).toBe(true);
    // The one-off window applies on the closed day (docs/SHARED_CALENDAR_SPEC.md R-ONE-01 and R-OVR-03).
    expect(day.windows).toEqual([
      { start: at(date, '09:00'), end: at(date, '10:00'), typeId: ids.pool, typeName: 'GYM', source: 'one_off', sourceId: added.body?.windowId },
    ]);

    // Clean up: the window, then the override.
    expect((await api('DELETE', `/calendar/windows/${added.body?.windowId}`, adminToken)).status).toBe(204);
    expect((await api('DELETE', `/calendar/overrides/${date}`, adminToken)).status).toBe(204);
  });

  it('a one-off window deleted (204) leaves the view; an unknown id is 404 window_not_found, a malformed one 400', async () => {
    const date = addDays(D(), 14);
    const res = await api('DELETE', `/calendar/windows/${windowIds.ac08}`, adminToken);
    expect(res.status).toBe(204);
    expect(res.body).toBeUndefined();
    expect((await dayOf(adminToken, date)).windows).toEqual(mondayWindows(date));

    for (const id of [windowIds.ac08, ulid()]) {
      const missing = await api('DELETE', `/calendar/windows/${id}`, adminToken);
      expect(missing.status).toBe(404);
      expect(missing.body).toMatchObject({ error: 'window_not_found' });
    }
    expect((await api('DELETE', '/calendar/windows/not-a-ulid', adminToken)).status).toBe(400);
  });

  it('date_in_past: yesterday is 409 on all four routes; today is accepted', async () => {
    const yesterday = addDays(today(), -1);
    const window = { start: '22:00', end: '23:00', typeId: ids.pool };
    // A one-off window dated yesterday cannot come from the API, which refuses a past date
    // (docs/SHARED_CALENDAR_SPEC.md R-AV-02): written directly.
    const pastId = ulid();
    await putCalendarItem({ PK: 'WINDOW', SK: `${yesterday}#${pastId}`, date: yesterday, ...window, createdAt: new Date().toISOString(), createdBy: { username: 'admin', role: 'admin' } });
    for (const res of [
      await api('PUT', `/calendar/overrides/${yesterday}`, adminToken, { windows: [window] }),
      await api('DELETE', `/calendar/overrides/${yesterday}`, adminToken),
      await api('POST', '/calendar/windows', adminToken, { date: yesterday, ...window }),
      await api('DELETE', `/calendar/windows/${pastId}`, adminToken),
    ]) {
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ error: 'date_in_past' });
    }
    expect(await getCalendarItem('WINDOW', `${yesterday}#${pastId}`)).toBeDefined();

    // Today, late in the evening, where no pattern of the journeys lies: accepted, then cleaned up.
    const date = today();
    const set = await api('PUT', `/calendar/overrides/${date}`, adminToken, { windows: [window] });
    expect(set.status).toBe(200);
    const added = await api('POST', '/calendar/windows', adminToken, { date, start: '23:00', end: '24:00', typeId: ids.pool });
    expect(added.status).toBe(201);
    expect((await api('DELETE', `/calendar/windows/${added.body?.windowId}`, adminToken)).status).toBe(204);
    expect((await api('DELETE', `/calendar/overrides/${date}`, adminToken)).status).toBe(204);
  });

  it('a User calling any of the four routes is 403 forbidden', async () => {
    const date = D();
    for (const res of [
      await api('PUT', `/calendar/overrides/${date}`, aliceToken, { windows: [] }),
      await api('DELETE', `/calendar/overrides/${addDays(date, 7)}`, aliceToken),
      await api('POST', '/calendar/windows', aliceToken, { date, start: '13:00', end: '14:00', typeId: ids.pool }),
      await api('DELETE', `/calendar/windows/${ulid()}`, aliceToken),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: 'forbidden' });
    }
    // Nothing changed: D has no override, D + 7 keeps its empty one.
    expect((await dayOf(adminToken, date)).hasOverride).toBe(false);
    expect((await dayOf(adminToken, addDays(date, 7))).hasOverride).toBe(true);
  });
});

// Test names: R-… rules, AC-… scenarios and route numbers are those of docs/SHARED_CALENDAR_SPEC.md
// (scenarios in its section 18.3, routes in its section 11.1).
describe('booking (route 17)', () => {
  // What the earlier journeys leave behind (read from the override and one-off window journeys above):
  // - settings cancellationNoticeHours 48, minBookingNoticeHours 2, bookingHorizonDays 30,
  //   maxFutureAppointmentsPerUser null;
  // - types GYM (ids.pool) and Studio (ids.viewStudio);
  // - patterns Monday 07:00–08:00 GYM from 2026-11-01 and Monday 08:00–12:00 Studio from a past
  //   Monday (both open-ended), and Sunday 01:00–04:00 Studio on the next spring-forward Sunday only;
  // - an empty override on D + 7 (D = the next Monday at least 8 days ahead); one one-off window
  //   dated yesterday (written directly); no other override or window; no appointment.
  // These journeys rely on none of it. They save their own settings first (and restore the
  // leftover ones at the end), and book on Wednesdays, which no earlier journey touches, at their
  // own two types with their own Wednesday pattern. W is the next Wednesday at least 8 days ahead,
  // W2 = W + 7; dates come from the real today, computed with the shared helpers. In the
  // scenarios of docs/SHARED_CALENDAR_SPEC.md section 18.3, dave plays alice and erin plays bob
  // (throw-away Users, as docs/SHARED_CALENDAR_SPEC.md section 18.2 explains).
  const ZONE = 'Europe/Rome';
  const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
  const HOUR_MS = 60 * 60 * 1000;
  const today = () => localDateOf(new Date().toISOString(), ZONE);
  const nextWednesday = (from: string) => {
    let d = from;
    while (weekdayOf(d) !== 3) d = addDays(d, 1);
    return d;
  };
  const W = () => nextWednesday(addDays(today(), 8));
  const W2 = () => addDays(W(), 7);
  const at = (date: string, time: string) => toInstant(date, time, ZONE);
  const plus = (instant: string, minutes: number) => new Date(Date.parse(instant) + minutes * 60_000).toISOString();
  const book = (token: string, body: Record<string, unknown>) => api('POST', '/calendar/appointments', token, body);
  // The access token's `sub` claim: what the appointment stores as userId.
  const subOf = (token: string) => (JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as { sub: string }).sub;
  const BOOKING_SETTINGS = { cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null };
  const setSettings = async (values: Record<string, unknown>) => {
    expect((await api('PUT', '/calendar/settings', adminToken, { ...BOOKING_SETTINGS, ...values })).status).toBe(200);
  };

  let daveToken: string;
  let erinToken: string;
  let leftover: Record<string, unknown>;
  const room: Record<string, string> = {};
  const booked: Record<string, Record<string, unknown>> = {};
  let patternId: string;
  const pattern = (more: object = {}) => ({ weekday: 3, start: '08:00', end: '12:00', typeId: room.main, validFrom: addDays(W(), -21), validUntil: null, ...more });

  beforeAll(async () => {
    for (const username of ['dave', 'erin']) {
      await removeUserIfPresent(username);
      const res = await api('POST', '/users', adminToken, { username });
      expect(res.status).toBe(201);
      const token = await signIn(username, res.body?.password as string);
      if (username === 'dave') daveToken = token;
      else erinToken = token;
    }
  });

  afterAll(async () => {
    await removeUserIfPresent('dave');
    await removeUserIfPresent('erin');
  });

  it('prepares the settings, two types and the Wednesday pattern 08:00–12:00 from a past Wednesday', async () => {
    leftover = (await api('GET', '/calendar/settings', adminToken)).body!;
    await setSettings({});
    for (const [key, name] of [['main', 'Booking room'], ['other', 'Booking pool']] as const) {
      const res = await api('POST', '/calendar/types', adminToken, { name });
      expect(res.status).toBe(201);
      room[key] = res.body?.typeId as string;
    }
    const res = await api('POST', '/calendar/patterns', adminToken, pattern());
    expect(res.status).toBe(201);
    patternId = res.body?.patternId as string;
  });

  it('AC-10: dave books W 09:00: 201, end + 60 min, the type, cancellableUntil; APPT, APPTID and EVENT items written', async () => {
    const start = at(W(), '09:00');
    const res = await book(daveToken, { start, note: '  First lesson ' });
    expect(res.status).toBe(201);
    const id = res.body?.appointmentId as string;
    const createdAt = res.body?.createdAt as string;
    const dave = { username: 'dave', role: 'user' };
    expect(res.body).toEqual({
      appointmentId: expect.stringMatching(ULID),
      username: 'dave',
      start,
      end: plus(start, 60),
      date: W(),
      typeId: room.main,
      typeName: 'Booking room',
      note: 'First lesson',
      status: 'booked',
      createdAt: expect.any(String),
      createdBy: dave,
      updatedAt: createdAt,
      updatedBy: dave,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      replaces: null,
      replacedBy: null,
      cancellableUntil: new Date(Date.parse(start) - 24 * HOUR_MS).toISOString(),
    });
    booked.ac10 = res.body!;

    const sk = `${start}#${id}`;
    const stored = {
      userId: subOf(daveToken),
      username: 'dave',
      start,
      end: plus(start, 60),
      date: W(),
      typeId: room.main,
      typeNameAtBooking: 'Booking room',
      note: 'First lesson',
      status: 'booked',
      createdAt,
      createdBy: dave,
      updatedAt: createdAt,
      updatedBy: dave,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      replaces: null,
      replacedBy: null,
      version: 1,
    };
    expect(await getCalendarItem('APPT', sk)).toEqual({ PK: 'APPT', SK: sk, ...stored });
    expect(await getCalendarItem(`APPTID#${id}`, 'APPTID')).toEqual({ PK: `APPTID#${id}`, SK: 'APPTID', sk });
    const events = (await queryCalendarPartition('EVENT')).filter((e) => (e.appointment as { appointmentId?: string }).appointmentId === id);
    expect(events).toEqual([
      {
        PK: 'EVENT',
        SK: `${createdAt}#${events[0]?.eventId}`,
        eventId: expect.stringMatching(ULID),
        type: 'appointment.booked',
        occurredAt: createdAt,
        actor: dave,
        recipients: { userId: subOf(daveToken), username: 'dave', administrator: true },
        appointment: { appointmentId: id, ...stored },
        schemaVersion: 1,
      },
    ]);
  });

  it('AC-11: erin books the same slot: 409 slot_taken', async () => {
    const res = await book(erinToken, { start: at(W(), '09:00') });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'slot_taken' });
  });

  it('AC-12: erin’s view of W has the busy interval and no slot at 09:00, and nothing of dave’s', async () => {
    const res = await api('GET', `/calendar?from=${W()}&to=${W()}`, erinToken);
    expect(res.status).toBe(200);
    const day = (res.body?.days as { busy: unknown[]; slots: { start: string }[] }[])[0]!;
    expect(day.busy).toEqual([{ start: at(W(), '09:00'), end: at(W(), '10:00') }]);
    expect(day.slots.map((s) => s.start)).toEqual(['08:00', '10:00', '11:00'].map((t) => at(W(), t)));
    expect(res.body?.appointments).toEqual([]);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('dave');
    expect(text).not.toContain(booked.ac10!.appointmentId as string);
    // dave sees his own, with cancellableUntil.
    const own = await api('GET', `/calendar?from=${W()}&to=${W()}`, daveToken);
    expect(own.body?.appointments).toEqual([booked.ac10]);
  });

  it('AC-13: dave books 09:30: 400 invalid_request', async () => {
    const res = await book(daveToken, { start: at(W(), '09:30') });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_request', message: 'Invalid input: start must be a whole hour' });
  });

  it('AC-14: the Administrator books dave W2 09:15–10:00: 201, cancellableUntil null', async () => {
    const res = await book(adminToken, { username: 'dave', start: at(W2(), '09:15'), end: at(W2(), '10:00') });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ username: 'dave', createdBy: { username: 'admin', role: 'admin' }, cancellableUntil: null });
    booked.ac14 = res.body!;
    expect((await getCalendarItem('APPT', `${at(W2(), '09:15')}#${res.body?.appointmentId}`))?.userId).toBe(subOf(daveToken));
  });

  it('AC-15: dave then books W2 09:00: 409 slot_taken (partial overlap)', async () => {
    const res = await book(daveToken, { start: at(W2(), '09:00') });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'slot_taken' });
  });

  it('AC-16: dave books 12:00, outside the window: 409 outside_availability', async () => {
    const res = await book(daveToken, { start: at(W(), '12:00') });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'outside_availability' });
  });

  it('AC-17: horizon 7, W 11:00 (8 or more days ahead): dave 409 booking_beyond_horizon; the Administrator books it for dave: 201', async () => {
    await setSettings({ bookingHorizonDays: 7 });
    const start = at(W(), '11:00');
    const res = await book(daveToken, { start });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'booking_beyond_horizon' });
    const admin = await book(adminToken, { username: 'dave', start });
    expect(admin.status).toBe(201);
    booked.ac17 = admin.body!;
    await setSettings({});
  });

  it('AC-18: notice 720 h: dave books W 10:00: 409 booking_notice_too_short', async () => {
    await setSettings({ minBookingNoticeHours: 720 });
    const res = await book(daveToken, { start: at(W(), '10:00') });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'booking_notice_too_short' });
    await setSettings({});
  });

  it('AC-19: limit 1 while dave holds future appointments: dave 409 appointment_limit_reached; the Administrator books for dave: 201', async () => {
    await setSettings({ maxFutureAppointmentsPerUser: 1 });
    const start = at(W2(), '10:00');
    const res = await book(daveToken, { start });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'appointment_limit_reached' });
    // erin holds none, so the limit does not stop her (counted per User).
    expect((await book(erinToken, { start: at(W2(), '08:00') })).status).toBe(201);
    const admin = await book(adminToken, { username: 'dave', start });
    expect(admin.status).toBe(201);
    await setSettings({});
  });

  it('a User naming someone else is 403; the Administrator booking without a username is 400, for admin 409 target_not_user, for an unknown username 404', async () => {
    const start = at(W2(), '11:00');
    const other = await book(daveToken, { username: 'erin', start });
    expect(other.status).toBe(403);
    expect(other.body).toMatchObject({ error: 'forbidden' });
    const missing = await book(adminToken, { start });
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({ error: 'invalid_request', message: 'Invalid input: username' });
    const toAdmin = await book(adminToken, { username: 'admin', start });
    expect(toAdmin.status).toBe(409);
    expect(toAdmin.body).toMatchObject({ error: 'target_not_user' });
    const unknown = await book(adminToken, { username: 'nobody-here', start });
    expect(unknown.status).toBe(404);
    expect(unknown.body).toMatchObject({ error: 'user_not_found' });
  });

  it('AC-25: an empty override on W is 409 availability_conflict listing dave’s appointments; a User gets 403 and no conflicts', async () => {
    const res = await api('PUT', `/calendar/overrides/${W()}`, adminToken, { windows: [] });
    expect(res.status).toBe(409);
    const conflict = (a: Record<string, unknown>) => ({ appointmentId: a.appointmentId, username: 'dave', start: a.start, end: a.end });
    expect(res.body).toEqual({
      error: 'availability_conflict',
      message: '2 appointments would fall outside the availability',
      conflicts: [conflict(booked.ac10!), conflict(booked.ac17!)],
    });
    expect(await getCalendarItem('OVERRIDE', W())).toBeUndefined();
    const asUser = await api('PUT', `/calendar/overrides/${W()}`, daveToken, { windows: [] });
    expect(asUser.status).toBe(403);
    expect(asUser.body).not.toHaveProperty('conflicts');
  });

  it('AC-26: changing the pattern’s type is 409 availability_conflict; AC-27: extending it to 07:00–12:00 is 200', async () => {
    const changed = await api('PUT', `/calendar/patterns/${patternId}`, adminToken, pattern({ typeId: room.other }));
    expect(changed.status).toBe(409);
    expect(changed.body).toMatchObject({ error: 'availability_conflict' });
    expect((changed.body?.conflicts as { appointmentId: string }[]).map((c) => c.appointmentId)).toContain(booked.ac10!.appointmentId);
    expect(await getCalendarItem('PATTERN', patternId)).toMatchObject({ typeId: room.main });

    const extended = await api('PUT', `/calendar/patterns/${patternId}`, adminToken, pattern({ start: '07:00' }));
    expect(extended.status).toBe(200);
    expect(extended.body).toMatchObject({ start: '07:00', end: '12:00', typeId: room.main });
  });

  it('AC-34: two bookings of the same slot at the same moment: exactly one 201, the other 409 slot_taken', async () => {
    const start = at(W2(), '11:00');
    const answers = await Promise.all([book(daveToken, { start }), book(erinToken, { start })]);
    expect(answers.map((a) => a.status).sort()).toEqual([201, 409]);
    expect(answers.find((a) => a.status === 409)?.body).toMatchObject({ error: 'slot_taken' });
    expect((await queryCalendarPartition('APPT')).filter((a) => a.start === start)).toHaveLength(1);
  });

  it('R-BOOK-10: a deleted-user marker for dave’s sub makes his booking 404 user_not_found and writes nothing', async () => {
    const marker = { PK: `DELETEDUSER#${subOf(daveToken)}`, SK: 'DELETEDUSER' };
    await putCalendarItem({ ...marker, username: 'dave', deletedAt: new Date().toISOString(), deletedBy: { username: 'admin', role: 'admin' } });
    const before = (await queryCalendarPartition('APPT')).length;
    const events = (await queryCalendarPartition('EVENT')).length;
    try {
      const start = at(W2(), '07:00');
      for (const res of [await book(daveToken, { start }), await book(adminToken, { username: 'dave', start })]) {
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'user_not_found', message: 'The user has been deleted' });
      }
      expect(await queryCalendarPartition('APPT')).toHaveLength(before);
      expect(await queryCalendarPartition('EVENT')).toHaveLength(events);
      // erin is not affected.
      expect((await book(erinToken, { start })).status).toBe(201);
    } finally {
      await deleteCalendarItem(marker.PK, marker.SK);
    }
    expect(await getCalendarItem(marker.PK, marker.SK)).toBeUndefined();
  });

  it('every booking wrote exactly one event; the settings are restored to what the earlier journeys left', async () => {
    const appointments = await queryCalendarPartition('APPT');
    const events = await queryCalendarPartition('EVENT');
    expect(events).toHaveLength(appointments.length);
    expect(events.every((e) => e.type === 'appointment.booked' && e.schemaVersion === 1)).toBe(true);

    const { cancellationNoticeHours, minBookingNoticeHours, bookingHorizonDays, maxFutureAppointmentsPerUser } = leftover;
    const values = { cancellationNoticeHours, minBookingNoticeHours, bookingHorizonDays, maxFutureAppointmentsPerUser };
    const res = await api('PUT', '/calendar/settings', adminToken, values);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(values);
  });
});

// Test names: AC-… scenarios and route numbers are those of docs/SHARED_CALENDAR_SPEC.md (scenarios
// in its section 18.3, routes in its section 11.1).
describe('listing, note and cancel (routes 16, 18, 19)', () => {
  // What the earlier journeys leave behind (read from the booking journeys above):
  // - settings cancellationNoticeHours 48, minBookingNoticeHours 2, bookingHorizonDays 30,
  //   maxFutureAppointmentsPerUser null (restored by the booking journeys);
  // - types GYM, Studio, "Booking room" and "Booking pool"; the Monday patterns, the Sunday
  //   spring-forward pattern and the Wednesday 07:00–12:00 "Booking room" pattern; an empty
  //   override on a Monday; a one-off window dated yesterday;
  // - booked appointments on the Wednesdays W and W2 (W the next Wednesday at least 8 days ahead):
  //   five or four of the earlier `dave` (a deleted account, its own `sub`), two or three of the
  //   earlier `erin` (the concurrent booking of docs/SHARED_CALENDAR_SPEC.md AC-34 goes to
  //   whichever won). Both accounts were removed; their appointments stay as history under the
  //   names `dave` and `erin`.
  // These journeys rely on one part only: the earlier `dave` has booked appointments, which the
  // Administrator's `username=dave` returns and the new `dave`'s own list does not
  // (docs/SHARED_CALENDAR_SPEC.md section 11.1, the notes on route 16). They save their own
  // settings (restoring the leftover ones at the end), create a new `dave` and `erin` (new
  // `sub`s), and book on Thursdays, which no earlier journey touches, at their own type with
  // their own Thursday pattern. T is the next Thursday at least 8 days ahead, and the second
  // date is T + 7. The ended appointment that docs/SHARED_CALENDAR_SPEC.md AC-31 needs is
  // written directly, dated yesterday. Dates come from the real today, computed with the shared
  // helpers. In the scenarios of docs/SHARED_CALENDAR_SPEC.md section 18.3, dave plays alice and
  // erin plays bob.
  const ZONE = 'Europe/Rome';
  const HOUR_MS = 60 * 60 * 1000;
  const today = () => localDateOf(new Date().toISOString(), ZONE);
  const nextThursday = (from: string) => {
    let d = from;
    while (weekdayOf(d) !== 4) d = addDays(d, 1);
    return d;
  };
  const T = () => nextThursday(addDays(today(), 8));
  const T2 = () => addDays(T(), 7);
  const at = (date: string, time: string) => toInstant(date, time, ZONE);
  const plus = (instant: string, minutes: number) => new Date(Date.parse(instant) + minutes * 60_000).toISOString();
  const subOf = (token: string) => (JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as { sub: string }).sub;
  const SETTINGS = { cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null };
  const setSettings = async (values: Record<string, unknown>) => {
    expect((await api('PUT', '/calendar/settings', adminToken, { ...SETTINGS, ...values })).status).toBe(200);
  };
  const book = (token: string, body: Record<string, unknown>) => api('POST', '/calendar/appointments', token, body);
  const cancel = (token: string, id: string) => api('POST', `/calendar/appointments/${id}/cancel`, token);
  const note = (token: string, id: string, value: unknown) => api('PATCH', `/calendar/appointments/${id}`, token, { note: value });
  const list = async (token: string, query: string) => {
    const res = await api('GET', `/calendar/appointments?${query}`, token);
    expect(res.status).toBe(200);
    return res.body?.appointments as Record<string, unknown>[];
  };
  const eventsOf = async (id: string) =>
    (await queryCalendarPartition('EVENT')).filter((e) => (e.appointment as { appointmentId?: string }).appointmentId === id);
  const sk = (a: Record<string, unknown>) => `${a.start}#${a.appointmentId}`;

  let daveToken: string;
  let erinToken: string;
  let leftover: Record<string, unknown>;
  let typeId: string;
  const ids: Record<string, string> = {};
  const appts: Record<string, Record<string, unknown>> = {};

  beforeAll(async () => {
    for (const username of ['dave', 'erin']) {
      await removeUserIfPresent(username);
      const res = await api('POST', '/users', adminToken, { username });
      expect(res.status).toBe(201);
      const token = await signIn(username, res.body?.password as string);
      if (username === 'dave') daveToken = token;
      else erinToken = token;
    }
  });

  afterAll(async () => {
    await removeUserIfPresent('dave');
    await removeUserIfPresent('erin');
  });

  it('prepares the settings, a type, the Thursday pattern 08:00–12:00, and three bookings of dave and one of erin', async () => {
    leftover = (await api('GET', '/calendar/settings', adminToken)).body!;
    await setSettings({});
    const type = await api('POST', '/calendar/types', adminToken, { name: 'Listing room' });
    expect(type.status).toBe(201);
    typeId = type.body?.typeId as string;
    const pattern = await api('POST', '/calendar/patterns', adminToken, {
      weekday: 4, start: '08:00', end: '12:00', typeId, validFrom: addDays(T(), -21), validUntil: null,
    });
    expect(pattern.status).toBe(201);
    for (const [key, token, date, time] of [
      ['t9', daveToken, T(), '09:00'],
      ['t10', daveToken, T(), '10:00'],
      ['t2', daveToken, T2(), '09:00'],
      ['erin', erinToken, T(), '11:00'],
    ] as const) {
      const res = await book(token, { start: at(date, time) });
      expect(res.status).toBe(201);
      appts[key] = res.body!;
      ids[key] = res.body?.appointmentId as string;
    }
  });

  it('AC-20: dave cancels T 09:00 with enough notice: 200, cancelled; the APPT item and one appointment.cancelled event; the slot is free again', async () => {
    const slotsOfT = async () => {
      const res = await api('GET', `/calendar?from=${T()}&to=${T()}`, erinToken);
      const day = (res.body?.days as { slots: { start: string }[]; busy: { start: string }[] }[])[0]!;
      return { slots: day.slots.map((s) => s.start), busy: day.busy.map((b) => b.start) };
    };
    expect(await slotsOfT()).toEqual({ slots: [at(T(), '08:00')], busy: [at(T(), '09:00'), at(T(), '10:00')] });

    const res = await cancel(daveToken, ids.t9!);
    expect(res.status).toBe(200);
    const dave = { username: 'dave', role: 'user' };
    const cancelledAt = res.body?.cancelledAt as string;
    expect(res.body).toEqual({
      ...appts.t9,
      status: 'cancelled',
      cancelledAt: expect.any(String),
      cancelledBy: dave,
      cancelReason: 'cancelled',
      updatedAt: cancelledAt,
      updatedBy: dave,
      cancellableUntil: null,
    });
    const item = await getCalendarItem('APPT', sk(appts.t9!));
    expect(item).toMatchObject({ status: 'cancelled', cancelledAt, cancelledBy: dave, cancelReason: 'cancelled', updatedAt: cancelledAt, updatedBy: dave, version: 2, userId: subOf(daveToken) });
    const events = await eventsOf(ids.t9!);
    expect(events.map((e) => e.type)).toEqual(['appointment.booked', 'appointment.cancelled']);
    expect(events[1]).toMatchObject({ occurredAt: cancelledAt, actor: dave, recipients: { userId: subOf(daveToken), username: 'dave', administrator: true } });
    const stored = Object.fromEntries(Object.entries(item!).filter(([key]) => key !== 'PK' && key !== 'SK'));
    expect(events[1]!.appointment).toEqual({ appointmentId: ids.t9, ...stored });

    expect(await slotsOfT()).toEqual({ slots: [at(T(), '08:00'), at(T(), '09:00')], busy: [at(T(), '10:00')] });
    // Cancelling it again: no longer active.
    expect((await cancel(daveToken, ids.t9!)).body).toMatchObject({ error: 'appointment_not_active' });
  });

  it('AC-21: notice 720 h: dave cancelling T 10:00 is 403 cancellation_notice_too_short; the Administrator cancels it: 200', async () => {
    await setSettings({ cancellationNoticeHours: 720 });
    try {
      const res = await cancel(daveToken, ids.t10!);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'cancellation_notice_too_short', message: 'Too late to cancel this appointment' });
      expect(await getCalendarItem('APPT', sk(appts.t10!))).toMatchObject({ status: 'booked', version: 1 });
      const admin = await cancel(adminToken, ids.t10!);
      expect(admin.status).toBe(200);
      expect(admin.body).toMatchObject({ status: 'cancelled', cancelledBy: { username: 'admin', role: 'admin' }, cancelReason: 'cancelled', cancellableUntil: null });
    } finally {
      await setSettings({});
    }
  });

  it('AC-30: erin cancelling or editing dave’s appointment is 404 appointment_not_found; an unknown id too; a malformed one 400', async () => {
    for (const res of [await cancel(erinToken, ids.t2!), await note(erinToken, ids.t2!, 'mine now')]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'appointment_not_found', message: 'No appointment with this id' });
    }
    expect(await getCalendarItem('APPT', sk(appts.t2!))).toMatchObject({ status: 'booked', note: null, version: 1 });
    const unknown = ulid();
    for (const token of [daveToken, adminToken]) {
      expect((await cancel(token, unknown)).status).toBe(404);
      expect((await note(token, unknown, 'x')).status).toBe(404);
    }
    expect((await cancel(daveToken, 'not-a-ulid')).status).toBe(400);
  });

  it('AC-31: an ended appointment (written directly): the Administrator’s cancel and note are 409 appointment_not_active', async () => {
    const yesterday = addDays(today(), -1);
    const start = at(yesterday, '09:00');
    const id = ulid();
    const by = { username: 'dave', role: 'user' };
    const created = new Date(Date.parse(start) - 7 * 24 * HOUR_MS).toISOString();
    await putCalendarItem({
      PK: 'APPT', SK: `${start}#${id}`, userId: subOf(daveToken), username: 'dave', start, end: plus(start, 60), date: yesterday,
      typeId, typeNameAtBooking: 'Listing room', note: null, status: 'booked', createdAt: created, createdBy: by, updatedAt: created,
      updatedBy: by, cancelledAt: null, cancelledBy: null, cancelReason: null, replaces: null, replacedBy: null, version: 1,
    });
    await putCalendarItem({ PK: `APPTID#${id}`, SK: 'APPTID', sk: `${start}#${id}` });
    ids.ended = id;
    for (const res of [await cancel(adminToken, id), await note(adminToken, id, 'late'), await cancel(daveToken, id)]) {
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'appointment_not_active', message: 'The appointment is cancelled or has ended' });
    }
    expect(await getCalendarItem('APPT', `${start}#${id}`)).toMatchObject({ status: 'booked', note: null, version: 1 });
    expect(await eventsOf(id)).toEqual([]);
  });

  it('the note: dave sets it (200, one appointment.note_updated event), the same note writes nothing, the Administrator clears it with null', async () => {
    const set = await note(daveToken, ids.t2!, '  Bring the music  ');
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ note: 'Bring the music', status: 'booked', updatedBy: { username: 'dave', role: 'user' } });
    expect(set.body?.cancellableUntil).toBe(new Date(Date.parse(at(T2(), '09:00')) - 24 * HOUR_MS).toISOString());
    expect(await getCalendarItem('APPT', sk(appts.t2!))).toMatchObject({ note: 'Bring the music', version: 2 });
    let events = await eventsOf(ids.t2!);
    expect(events.map((e) => e.type)).toEqual(['appointment.booked', 'appointment.note_updated']);
    expect((events[1]!.appointment as { note: string }).note).toBe('Bring the music');

    const same = await note(daveToken, ids.t2!, 'Bring the music');
    expect(same.status).toBe(200);
    expect(same.body?.updatedAt).toBe(set.body?.updatedAt);
    expect(await eventsOf(ids.t2!)).toHaveLength(2);

    const cleared = await note(adminToken, ids.t2!, null);
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({ note: null, updatedBy: { username: 'admin', role: 'admin' }, cancellableUntil: null });
    events = await eventsOf(ids.t2!);
    expect(events.map((e) => e.type)).toEqual(['appointment.booked', 'appointment.note_updated', 'appointment.note_updated']);
    expect(await getCalendarItem('APPT', sk(appts.t2!))).toMatchObject({ note: null, version: 3 });

    const tooLong = await note(daveToken, ids.t2!, 'a'.repeat(501));
    expect(tooLong.status).toBe(400);
    // A cancelled appointment's note cannot change.
    expect((await note(daveToken, ids.t9!, 'x')).body).toMatchObject({ error: 'appointment_not_active' });
  });

  it('A6: dave’s history with status=all has his booked, cancelled and ended appointments and nobody else’s; upcoming only the future booked one', async () => {
    const range = `from=${addDays(today(), -1)}&to=${addDays(today(), 28)}`;
    const history = await list(daveToken, `${range}&status=all`);
    expect(history.map((a) => a.appointmentId)).toEqual([ids.ended, ids.t9, ids.t10, ids.t2]);
    expect(history.map((a) => [a.status, a.cancellableUntil === null])).toEqual([
      ['booked', false], // ended: an instant in the past
      ['cancelled', true],
      ['cancelled', true],
      ['booked', false],
    ]);
    expect(history.every((a) => a.username === 'dave' && !('userId' in a) && a.typeName === 'Listing room')).toBe(true);
    expect((await list(daveToken, range)).map((a) => a.appointmentId)).toEqual([ids.ended, ids.t2]);
    expect((await list(daveToken, `${range}&status=cancelled`)).map((a) => a.appointmentId)).toEqual([ids.t9, ids.t10]);
    expect((await list(daveToken, 'upcoming=true')).map((a) => a.appointmentId)).toEqual([ids.t2]);
    expect((await list(daveToken, 'upcoming=true&status=all')).map((a) => a.appointmentId)).toEqual([ids.t9, ids.t10, ids.t2]);
    // Naming himself changes nothing; naming erin is 403.
    expect((await list(daveToken, `${range}&status=all&username=dave`)).map((a) => a.appointmentId)).toEqual(history.map((a) => a.appointmentId));
    const other = await api('GET', `/calendar/appointments?${range}&username=erin`, daveToken);
    expect(other.status).toBe(403);
    expect(other.body).toMatchObject({ error: 'forbidden' });
    expect((await list(erinToken, `${range}&status=all`)).map((a) => a.appointmentId)).toEqual([ids.erin]);
  });

  it('the Administrator’s list: everything without username; username=dave includes the earlier dave’s appointments; an unknown name is empty', async () => {
    const range = `from=${addDays(today(), -1)}&to=${addDays(today(), 28)}`;
    const inRange = (date: string) => date >= addDays(today(), -1) && date <= addDays(today(), 28);
    const stored = (await queryCalendarPartition('APPT')).filter((a) => inRange(a.date as string));
    const earlierDave = stored.filter((a) => a.username === 'dave' && a.userId !== subOf(daveToken));
    expect(earlierDave.length).toBeGreaterThan(0);

    const all = await list(adminToken, `${range}&status=all`);
    expect(all.map((a) => a.appointmentId)).toEqual(stored.map((a) => (a.SK as string).split('#')[1]));
    expect(all.every((a) => a.cancellableUntil === null)).toBe(true);

    const named = await list(adminToken, `${range}&status=all&username=dave`);
    const expected = stored.filter((a) => a.username === 'dave').map((a) => (a.SK as string).split('#')[1]);
    expect(named.map((a) => a.appointmentId)).toEqual(expected);
    for (const a of earlierDave) expect(named.map((n) => n.appointmentId)).toContain((a.SK as string).split('#')[1]);
    // The new dave's own list holds none of the earlier account's.
    const own = (await list(daveToken, `${range}&status=all`)).map((a) => a.appointmentId);
    for (const a of earlierDave) expect(own).not.toContain((a.SK as string).split('#')[1]);

    expect(await list(adminToken, `${range}&username=nobody-here`)).toEqual([]);
    const tooLong = await api('GET', `/calendar/appointments?from=${today()}&to=${addDays(today(), 92)}`, adminToken);
    expect(tooLong.status).toBe(400);
    const neither = await api('GET', '/calendar/appointments', adminToken);
    expect(neither.status).toBe(400);
  });

  it('the settings are restored to what the earlier journeys left', async () => {
    const { cancellationNoticeHours, minBookingNoticeHours, bookingHorizonDays, maxFutureAppointmentsPerUser } = leftover;
    const values = { cancellationNoticeHours, minBookingNoticeHours, bookingHorizonDays, maxFutureAppointmentsPerUser };
    const res = await api('PUT', '/calendar/settings', adminToken, values);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(values);
  });
});

// Test names: R-… rules, AC-… scenarios and route numbers are those of docs/SHARED_CALENDAR_SPEC.md
// (scenarios in its section 18.3, routes in its section 11.1).
describe('change (route 20)', () => {
  // What the earlier journeys leave behind (read from the listing journeys above):
  // - settings cancellationNoticeHours 48, minBookingNoticeHours 2, bookingHorizonDays 30,
  //   maxFutureAppointmentsPerUser null (restored by the listing journeys);
  // - types GYM, Studio, "Booking room", "Booking pool" and "Listing room"; the Monday, Sunday,
  //   Wednesday and Thursday patterns; an empty override on a Monday; a one-off window dated
  //   yesterday;
  // - appointments on Wednesdays and Thursdays and one ended yesterday, booked or cancelled, all
  //   under earlier `dave` and `erin` accounts (removed; their own `sub`s).
  // These journeys rely on none of it. They save their own settings first (restoring the leftover
  // ones at the end), create a new `dave` and `erin`, and book on Fridays, which no earlier journey
  // touches, at their own type with their own Friday pattern 08:00–12:00. F is the next Friday at
  // least 8 days ahead. One appointment of dave is changed step by step (d1 → c1 → … → c5); the
  // limit counts only booked appointments of the new dave with start > now, so the earlier
  // accounts' appointments do not matter. Dates come from the real today, computed with the shared
  // helpers. In the scenarios of docs/SHARED_CALENDAR_SPEC.md section 18.3, dave plays alice and erin bob.
  const ZONE = 'Europe/Rome';
  const today = () => localDateOf(new Date().toISOString(), ZONE);
  const nextFriday = (from: string) => {
    let d = from;
    while (weekdayOf(d) !== 5) d = addDays(d, 1);
    return d;
  };
  const F = () => nextFriday(addDays(today(), 8));
  const at = (time: string) => toInstant(F(), time, ZONE);
  const subOf = (token: string) => (JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as { sub: string }).sub;
  const SETTINGS = { cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null };
  const setSettings = async (values: Record<string, unknown>) => {
    expect((await api('PUT', '/calendar/settings', adminToken, { ...SETTINGS, ...values })).status).toBe(200);
  };
  const changeOf = (token: string, id: string, body: Record<string, unknown>) => api('POST', `/calendar/appointments/${id}/change`, token, body);
  const sk = (a: Record<string, unknown>) => `${a.start}#${a.appointmentId}`;
  const stored = async (a: Record<string, unknown>) => {
    const item = await getCalendarItem('APPT', sk(a));
    return item && { appointmentId: a.appointmentId, ...Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'PK' && key !== 'SK')) };
  };
  const changedEvents = async (oldId: string) =>
    (await queryCalendarPartition('EVENT')).filter((e) => e.type === 'appointment.changed' && (e.previous as { appointmentId: string }).appointmentId === oldId);
  const viewOfF = async (token: string) => {
    const res = await api('GET', `/calendar?from=${F()}&to=${F()}`, token);
    const day = (res.body?.days as { slots: { start: string }[]; busy: { start: string }[] }[])[0]!;
    return { slots: day.slots.map((s) => s.start), busy: day.busy.map((b) => b.start) };
  };
  const DAVE = { username: 'dave', role: 'user' };
  const ADMIN = { username: 'admin', role: 'admin' };

  let daveToken: string;
  let erinToken: string;
  let leftover: Record<string, unknown>;
  // dave's appointment as it is changed: d1, then the new one of each change.
  const appts: Record<string, Record<string, unknown>> = {};

  beforeAll(async () => {
    for (const username of ['dave', 'erin']) {
      await removeUserIfPresent(username);
      const res = await api('POST', '/users', adminToken, { username });
      expect(res.status).toBe(201);
      const token = await signIn(username, res.body?.password as string);
      if (username === 'dave') daveToken = token;
      else erinToken = token;
    }
  });

  afterAll(async () => {
    await removeUserIfPresent('dave');
    await removeUserIfPresent('erin');
  });

  it('prepares the settings, a type, the Friday pattern 08:00–12:00, and dave’s F 09:00 with a note', async () => {
    leftover = (await api('GET', '/calendar/settings', adminToken)).body!;
    await setSettings({});
    const type = await api('POST', '/calendar/types', adminToken, { name: 'Change room' });
    expect(type.status).toBe(201);
    const pattern = await api('POST', '/calendar/patterns', adminToken, {
      weekday: 5, start: '08:00', end: '12:00', typeId: type.body?.typeId, validFrom: addDays(F(), -21), validUntil: null,
    });
    expect(pattern.status).toBe(201);
    const res = await api('POST', '/calendar/appointments', daveToken, { start: at('09:00'), note: 'Warm-up first' });
    expect(res.status).toBe(201);
    appts.d1 = res.body!;
  });

  it('AC-22: dave changes 09:00 to 10:00: 201; old cancelled/changed with replacedBy, new with replaces and its pointer, one appointment.changed event; the view moves', async () => {
    expect(await viewOfF(erinToken)).toEqual({ slots: [at('08:00'), at('10:00'), at('11:00')], busy: [at('09:00')] });
    const res = await changeOf(daveToken, appts.d1!.appointmentId as string, { start: at('10:00') });
    expect(res.status).toBe(201);
    const { cancelled, booked } = res.body as Record<string, Record<string, unknown>>;
    const changedAt = booked!.createdAt as string;
    expect(cancelled).toEqual({
      ...appts.d1,
      status: 'cancelled',
      cancelledAt: changedAt,
      cancelledBy: DAVE,
      cancelReason: 'changed',
      replacedBy: booked!.appointmentId,
      updatedAt: changedAt,
      updatedBy: DAVE,
      cancellableUntil: null,
    });
    expect(booked).toMatchObject({
      username: 'dave', start: at('10:00'), end: at('11:00'), typeName: 'Change room', note: 'Warm-up first', status: 'booked',
      createdBy: DAVE, replaces: appts.d1!.appointmentId, replacedBy: null,
      cancellableUntil: new Date(Date.parse(at('10:00')) - 24 * 3_600_000).toISOString(),
    });
    expect(booked).not.toHaveProperty('userId');
    appts.c1 = booked!;

    const oldItem = await stored(appts.d1!);
    const newItem = await stored(booked!);
    expect(oldItem).toMatchObject({ status: 'cancelled', cancelReason: 'changed', replacedBy: booked!.appointmentId, version: 2 });
    expect(newItem).toMatchObject({ status: 'booked', replaces: appts.d1!.appointmentId, userId: subOf(daveToken), version: 1 });
    expect(await getCalendarItem(`APPTID#${booked!.appointmentId as string}`, 'APPTID')).toMatchObject({ sk: sk(booked!) });
    const events = await changedEvents(appts.d1!.appointmentId as string);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ occurredAt: changedAt, actor: DAVE, recipients: { userId: subOf(daveToken), username: 'dave', administrator: true } });
    expect(events[0]!.appointment).toEqual(newItem);
    expect(events[0]!.previous).toEqual(oldItem);

    expect(await viewOfF(erinToken)).toEqual({ slots: [at('08:00'), at('09:00'), at('11:00')], busy: [at('10:00')] });
  });

  it('AC-23: erin holds 11:00; dave changing 10:00 to 11:00 is 409 slot_taken, and nothing is written', async () => {
    expect((await api('POST', '/calendar/appointments', erinToken, { start: at('11:00') })).status).toBe(201);
    const counts = async () => [(await queryCalendarPartition('APPT')).length, (await queryCalendarPartition('EVENT')).length];
    const before = await counts();
    const res = await changeOf(daveToken, appts.c1!.appointmentId as string, { start: at('11:00') });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'slot_taken', message: 'The time is already booked' });
    expect(await stored(appts.c1!)).toMatchObject({ status: 'booked', replacedBy: null, version: 1 });
    expect(await counts()).toEqual(before);
    expect(await changedEvents(appts.c1!.appointmentId as string)).toEqual([]);
  });

  it('R-CHG-03: a change with note null clears the note (dave moves back to 09:00)', async () => {
    const res = await changeOf(daveToken, appts.c1!.appointmentId as string, { start: at('09:00'), note: null });
    expect(res.status).toBe(201);
    const { booked } = res.body as Record<string, Record<string, unknown>>;
    expect(booked).toMatchObject({ start: at('09:00'), note: null, replaces: appts.c1!.appointmentId });
    expect(await stored(booked!)).toMatchObject({ note: null });
    appts.c2 = booked!;
  });

  it('AC-24: the Administrator changes dave’s 09:00–10:00 to 09:00–10:30 over its own old time: 201', async () => {
    const res = await changeOf(adminToken, appts.c2!.appointmentId as string, { start: at('09:00'), end: toInstant(F(), '10:30', ZONE) });
    expect(res.status).toBe(201);
    const { cancelled, booked } = res.body as Record<string, Record<string, unknown>>;
    expect(cancelled).toMatchObject({ status: 'cancelled', cancelledBy: ADMIN, cancelReason: 'changed', cancellableUntil: null });
    expect(booked).toMatchObject({ username: 'dave', start: at('09:00'), end: toInstant(F(), '10:30', ZONE), createdBy: ADMIN, cancellableUntil: null });
    expect(await stored(booked!)).toMatchObject({ userId: subOf(daveToken), createdBy: ADMIN });
    appts.c3 = booked!;
  });

  it('someone else’s appointment is 404; an already changed one is 409 appointment_not_active; a malformed id 400', async () => {
    const other = await changeOf(erinToken, appts.c3!.appointmentId as string, { start: at('08:00') });
    expect(other.status).toBe(404);
    expect(other.body).toEqual({ error: 'appointment_not_found', message: 'No appointment with this id' });
    for (const token of [daveToken, adminToken]) {
      const again = await changeOf(token, appts.d1!.appointmentId as string, { start: at('08:00') });
      expect(again.status).toBe(409);
      expect(again.body).toMatchObject({ error: 'appointment_not_active' });
    }
    expect((await changeOf(adminToken, ulid(), { start: at('08:00') })).status).toBe(404);
    expect((await changeOf(daveToken, 'not-a-ulid', { start: at('08:00') })).status).toBe(400);
    expect((await changeOf(daveToken, appts.c3!.appointmentId as string, { start: at('08:00'), username: 'dave' })).status).toBe(400);
    expect(await stored(appts.c3!)).toMatchObject({ status: 'booked', version: 1 });
  });

  it('the notice: with 720 h dave’s change is 403 cancellation_notice_too_short; the Administrator’s is 201', async () => {
    await setSettings({ cancellationNoticeHours: 720 });
    try {
      const res = await changeOf(daveToken, appts.c3!.appointmentId as string, { start: at('09:00') });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'cancellation_notice_too_short', message: 'Too late to change this appointment' });
      expect(await stored(appts.c3!)).toMatchObject({ status: 'booked', version: 1 });
      const admin = await changeOf(adminToken, appts.c3!.appointmentId as string, { start: at('09:00') });
      expect(admin.status).toBe(201);
      appts.c4 = (admin.body as Record<string, Record<string, unknown>>).booked!;
      expect(appts.c4).toMatchObject({ start: at('09:00'), end: at('10:00') });
    } finally {
      await setSettings({});
    }
  });

  it('the limit: with maxFutureAppointmentsPerUser 1 dave cannot book another, but moves his only future appointment', async () => {
    await setSettings({ maxFutureAppointmentsPerUser: 1 });
    try {
      const another = await api('POST', '/calendar/appointments', daveToken, { start: at('08:00') });
      expect(another.status).toBe(409);
      expect(another.body).toMatchObject({ error: 'appointment_limit_reached' });
      const res = await changeOf(daveToken, appts.c4!.appointmentId as string, { start: at('10:00') });
      expect(res.status).toBe(201);
      appts.c5 = (res.body as Record<string, Record<string, unknown>>).booked!;
      expect(appts.c5).toMatchObject({ start: at('10:00'), replaces: appts.c4!.appointmentId, status: 'booked' });
    } finally {
      await setSettings({});
    }
    // One appointment.changed event per change, each naming the one before: five changes, d1 → c5.
    for (const [from, to] of [['d1', 'c1'], ['c1', 'c2'], ['c2', 'c3'], ['c3', 'c4'], ['c4', 'c5']] as const) {
      const events = await changedEvents(appts[from]!.appointmentId as string);
      expect(events.map((e) => (e.appointment as { appointmentId: string }).appointmentId)).toEqual([appts[to]!.appointmentId]);
    }
  });

  it('the settings are restored to what the earlier journeys left', async () => {
    const { cancellationNoticeHours, minBookingNoticeHours, bookingHorizonDays, maxFutureAppointmentsPerUser } = leftover;
    const values = { cancellationNoticeHours, minBookingNoticeHours, bookingHorizonDays, maxFutureAppointmentsPerUser };
    const res = await api('PUT', '/calendar/settings', adminToken, values);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(values);
  });
});

// Test names: AC-… scenarios and route numbers are those of docs/SHARED_CALENDAR_SPEC.md (scenarios
// in its section 18.3, routes in its section 11.1).
describe('users (route 21, deletion)', () => {
  // What the earlier journeys leave behind (read from the change journeys above):
  // - settings cancellationNoticeHours 48, minBookingNoticeHours 2, bookingHorizonDays 30,
  //   maxFutureAppointmentsPerUser null (restored by the change journeys);
  // - the types and patterns of the earlier blocks (Monday, Sunday, Wednesday, Thursday, Friday;
  //   the Tuesday pattern of the pattern journeys was deleted again in
  //   docs/SHARED_CALENDAR_SPEC.md AC-28); an empty override on a Monday; a one-off window dated
  //   yesterday;
  // - appointments on Wednesdays, Thursdays and Fridays and one ended yesterday, booked or
  //   cancelled, all under earlier `dave` and `erin` accounts (removed by removeUserIfPresent, which
  //   writes no marker; their own `sub`s).
  // These journeys rely on one part only: the earlier `dave` accounts have booked appointments not
  // yet ended, which the deletion of the new `dave` must leave alone (it selects by `sub`,
  // docs/SHARED_CALENDAR_SPEC.md R-DEL-02).
  // They save their own settings first (restoring the leftover ones at the end), create a new `dave`
  // and `erin`, and book on Tuesdays, which no earlier journey books on, at their own type with
  // their own Tuesday pattern 08:00–12:00. U is the next Tuesday at least 8 days ahead, U2 = U + 7.
  // The ended appointment and the one in progress are written directly. Dates come from the real
  // today, computed with the shared helpers. In the scenarios of docs/SHARED_CALENDAR_SPEC.md
  // section 18.3, dave plays alice and erin plays bob.
  const ZONE = 'Europe/Rome';
  const HOUR_MS = 60 * 60 * 1000;
  const today = () => localDateOf(new Date().toISOString(), ZONE);
  const nextTuesday = (from: string) => {
    let d = from;
    while (weekdayOf(d) !== 2) d = addDays(d, 1);
    return d;
  };
  const U = () => nextTuesday(addDays(today(), 8));
  const U2 = () => addDays(U(), 7);
  const at = (date: string, time: string) => toInstant(date, time, ZONE);
  const subOf = (token: string) => (JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as { sub: string }).sub;
  const SETTINGS = { cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null };
  const book = (token: string, body: Record<string, unknown>) => api('POST', '/calendar/appointments', token, body);
  const sk = (a: Record<string, unknown>) => `${a.start}#${a.appointmentId}`;
  const ADMIN = { username: 'admin', role: 'admin' };
  const DAVE = { username: 'dave', role: 'user' };

  let daveToken: string;
  let erinToken: string;
  let daveSub: string;
  let typeId: string;
  let leftover: Record<string, unknown>;
  const appts: Record<string, Record<string, unknown>> = {};
  // The earlier `dave` accounts' booked appointments not yet ended, as stored before the deletion.
  let earlierDaves: Awaited<ReturnType<typeof queryCalendarPartition>>;

  // An appointment of the new dave written directly (the API cannot book a past start).
  const writeDirectly = async (start: string, end: string) => {
    const id = ulid();
    const created = new Date(Date.parse(start) - 7 * 24 * HOUR_MS).toISOString();
    const item = {
      PK: 'APPT', SK: `${start}#${id}`, userId: daveSub, username: 'dave', start, end, date: localDateOf(start, ZONE),
      typeId, typeNameAtBooking: 'Users room', note: null, status: 'booked', createdAt: created, createdBy: DAVE, updatedAt: created,
      updatedBy: DAVE, cancelledAt: null, cancelledBy: null, cancelReason: null, replaces: null, replacedBy: null, version: 1,
    };
    await putCalendarItem(item);
    await putCalendarItem({ PK: `APPTID#${id}`, SK: 'APPTID', sk: item.SK });
    return { appointmentId: id, start };
  };

  beforeAll(async () => {
    for (const username of ['dave', 'erin']) {
      await removeUserIfPresent(username);
      const res = await api('POST', '/users', adminToken, { username });
      expect(res.status).toBe(201);
      const token = await signIn(username, res.body?.password as string);
      if (username === 'dave') daveToken = token;
      else erinToken = token;
    }
    daveSub = subOf(daveToken);
  });

  afterAll(async () => {
    await removeUserIfPresent('dave');
    await removeUserIfPresent('erin');
  });

  it('prepares the settings, a type and the Tuesday pattern 08:00–12:00', async () => {
    leftover = (await api('GET', '/calendar/settings', adminToken)).body!;
    expect((await api('PUT', '/calendar/settings', adminToken, SETTINGS)).status).toBe(200);
    const type = await api('POST', '/calendar/types', adminToken, { name: 'Users room' });
    expect(type.status).toBe(201);
    typeId = type.body?.typeId as string;
    const pattern = await api('POST', '/calendar/patterns', adminToken, {
      weekday: 2, start: '08:00', end: '12:00', typeId, validFrom: addDays(U(), -21), validUntil: null,
    });
    expect(pattern.status).toBe(201);
  });

  it('AC-32: GET /users lists alice, dave and erin, not admin, sorted by username; a User gets 403', async () => {
    const res = await api('GET', '/users', adminToken);
    expect(res.status).toBe(200);
    const users = res.body?.users as { username: string; createdAt: string }[];
    const names = users.map((u) => u.username);
    // Other files' throw-away users may be left over: assert on these three, not an exact list.
    expect(names).toEqual(expect.arrayContaining(['alice', 'dave', 'erin']));
    expect(names).not.toContain('admin');
    expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    for (const u of users) expect(u.createdAt).toBe(new Date(Date.parse(u.createdAt)).toISOString());
    expect(Object.keys(users[0]!).sort()).toEqual(['createdAt', 'username']);

    const asUser = await api('GET', '/users', aliceToken);
    expect(asUser.status).toBe(403);
    expect(asUser.body).toEqual({ error: 'forbidden', message: 'Not allowed for this account' });
  });

  it('AC-29 prepared: dave books U 09:00 and U2 10:00, erin U 08:00; an ended one and one in progress written directly', async () => {
    for (const [name, token, start] of [
      ['d1', daveToken, at(U(), '09:00')],
      ['d2', daveToken, at(U2(), '10:00')],
      ['e1', erinToken, at(U(), '08:00')],
    ] as const) {
      const res = await book(token, { start, note: 'Private note' });
      expect(res.status).toBe(201);
      appts[name] = res.body!;
    }
    const now = Date.now();
    const yesterday = addDays(today(), -1);
    appts.ended = await writeDirectly(at(yesterday, '09:00'), at(yesterday, '10:00'));
    appts.inProgress = await writeDirectly(new Date(now - 30 * 60_000).toISOString(), new Date(now + 60 * 60_000).toISOString());

    earlierDaves = (await queryCalendarPartition('APPT')).filter(
      (a) => a.username === 'dave' && a.userId !== daveSub && a.status === 'booked' && (a.end as string) > new Date().toISOString(),
    );
    expect(earlierDaves.length).toBeGreaterThan(0);
  });

  it('AC-29: DELETE /users/dave: 204; the future one and the one in progress cancelled/user_deleted by the Administrator with their events; the ended one, erin’s and the earlier daves’ untouched; the marker written', async () => {
    const endedBefore = await getCalendarItem('APPT', sk(appts.ended!));
    const erinBefore = await getCalendarItem('APPT', sk(appts.e1!));

    const res = await api('DELETE', '/users/dave', adminToken);
    expect(res.status).toBe(204);

    const events = await queryCalendarPartition('EVENT');
    for (const name of ['d1', 'd2', 'inProgress']) {
      const item = await getCalendarItem('APPT', sk(appts[name]!));
      expect(item).toMatchObject({ status: 'cancelled', cancelReason: 'user_deleted', cancelledBy: ADMIN, updatedBy: ADMIN, version: 2 });
      expect(item!.cancelledAt).toBe(item!.updatedAt);
      const own = events.filter((e) => (e.appointment as { appointmentId: string }).appointmentId === appts[name]!.appointmentId && e.type === 'appointment.cancelled');
      expect(own).toHaveLength(1);
      expect(own[0]).toMatchObject({
        actor: ADMIN,
        occurredAt: item!.cancelledAt,
        recipients: { userId: daveSub, username: 'dave', administrator: true },
        appointment: { status: 'cancelled', cancelReason: 'user_deleted' },
      });
    }
    expect(await getCalendarItem('APPT', sk(appts.ended!))).toEqual(endedBefore);
    expect(await getCalendarItem('APPT', sk(appts.e1!))).toEqual(erinBefore);
    for (const earlier of earlierDaves) expect(await getCalendarItem(earlier.PK as string, earlier.SK as string)).toEqual(earlier);

    const marker = await getCalendarItem(`DELETEDUSER#${daveSub}`, 'DELETEDUSER');
    expect(marker).toMatchObject({ username: 'dave', deletedBy: ADMIN });
    expect(marker!.deletedAt).toBe((await getCalendarItem('APPT', sk(appts.d1!)))!.cancelledAt);
  });

  it('AC-29: dave’s still-valid token booking a free slot answers 404 user_not_found, and nothing is written', async () => {
    const before = (await queryCalendarPartition('APPT')).length;
    const res = await book(daveToken, { start: at(U(), '11:00') });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'user_not_found', message: 'The user has been deleted' });
    expect((await queryCalendarPartition('APPT')).length).toBe(before);
  });

  it('the freed slots appear in erin’s view; dave is no longer listed; deleting dave again is 404', async () => {
    const day = async (date: string) => {
      const res = await api('GET', `/calendar?from=${date}&to=${date}`, erinToken);
      const d = (res.body?.days as { slots: { start: string }[]; busy: { start: string }[] }[])[0]!;
      return { slots: d.slots.map((s) => s.start), busy: d.busy.map((b) => b.start) };
    };
    // erin's own 08:00 is not a free slot; nobody else's is busy any more.
    expect(await day(U())).toEqual({ slots: [at(U(), '09:00'), at(U(), '10:00'), at(U(), '11:00')], busy: [] });
    expect((await day(U2())).slots).toContain(at(U2(), '10:00'));

    const listed = await api('GET', '/users', adminToken);
    expect((listed.body?.users as { username: string }[]).map((u) => u.username)).not.toContain('dave');

    const again = await api('DELETE', '/users/dave', adminToken);
    expect(again.status).toBe(404);
    expect(again.body).toEqual({ error: 'user_not_found', message: 'No user with this username' });
  });

  it('the settings are restored to what the earlier journeys left', async () => {
    const { cancellationNoticeHours, minBookingNoticeHours, bookingHorizonDays, maxFutureAppointmentsPerUser } = leftover;
    const values = { cancellationNoticeHours, minBookingNoticeHours, bookingHorizonDays, maxFutureAppointmentsPerUser };
    const res = await api('PUT', '/calendar/settings', adminToken, values);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(values);
  });
});
