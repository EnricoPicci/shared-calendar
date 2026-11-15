import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import {
  addDays,
  CALENDAR_LIMITS,
  localDateOf,
  weekdayOf,
  type AvailabilityType,
  type CalendarSettings,
  type CalendarView,
  UpdateSettingsBody,
} from '@shared-calendar/shared';
import { apiCall } from '../../src/services/api';
import { AvailabilityRulesService } from '../../src/services/availability-rules.service';
import { AvailabilityTypesService } from '../../src/services/availability-types.service';
import { CalendarSettingsService } from '../../src/services/calendar-settings.service';
import { SessionStore } from '../../src/services/session.store';
import { UsersService } from '../../src/services/users.service';
import { API, outcome, signedIn, signIn } from './local';

// The calendar journeys of docs/FRONTEND_SERVICES.md section 14.4: the settings, types and
// availability-rules services, and listUsers, against the back end's local stack. Runs only with
// RUN_INTEGRATION=1, never at the same time as the back end's journeys. The local calendar is
// shared with them and with the smoke test, so this file:
// - never resets the table and never deletes or changes what it did not create;
// - creates only types named `fe-calendar …` and items on dates about a year ahead (from today
//   + 330 days, a band of 31 days), each on a date that has no window and no override yet;
// - writes the settings back to the values it read (updatedAt/updatedBy stay changed). Those
//   values are kept in SAVED_SETTINGS (git-ignored) from before the first write until they are
//   written back, so a run killed in between (no afterAll) is repaired by the next run;
// - removes what an earlier failed run left (one-off windows, overrides, patterns of its types,
//   then the types) before and after, and the throw-away User `fe-calendar` before and after.
// `availability_conflict` is not covered here: it needs a booked appointment, which only the
// AppointmentsService of docs/IMPLEMENTATION_PLAN.md step 54 can make.

const USER = 'fe-calendar';
const PREFIX = 'fe-calendar ';
const BAND_OFFSET = 330;
const BAND_DAYS = CALENDAR_LIMITS.calendarViewDays; // one GET /calendar covers the band
const UNKNOWN_ID = '01JCZZZZZZZZZZZZZZZZZZZZZZ'; // a ULID no server will generate (its time is 2024)
// The settings read before the test changes them, kept until they are written back
// (docs/FRONTEND_SERVICES.md section 8, decision 35).
// `*.local.json` is git-ignored; the file exists only while the settings are not the ones read.
const SAVED_SETTINGS = new URL('./fe-calendar-settings.local.json', import.meta.url);

let admin: SessionStore;
let user: SessionStore; // fe-calendar, a plain User
let today: string;
const stores: SessionStore[] = [];

// ── Calls through the services, one fresh service per call ───────────────────────────────────

function types(store: SessionStore) {
  return new AvailabilityTypesService(API, store);
}
function rules(store: SessionStore) {
  return new AvailabilityRulesService(API, store);
}
function loadTypes(store: SessionStore) {
  const s = types(store);
  return outcome(s.typesResult$, () => s.load());
}
function createType(store: SessionStore, name: string) {
  const s = types(store);
  return outcome(s.createResult$, () => s.create(name));
}
function removeType(store: SessionStore, typeId: string) {
  const s = types(store);
  return outcome(s.removeResult$, () => s.remove(typeId));
}
function loadSettings(store: SessionStore) {
  const s = new CalendarSettingsService(API, store);
  return outcome(s.settingsResult$, () => s.load());
}
function updateSettings(store: SessionStore, settings: UpdateSettingsBody) {
  const s = new CalendarSettingsService(API, store);
  return outcome(s.updateResult$, () => s.update(settings));
}
function users(store: SessionStore) {
  return new UsersService(API, store);
}

// Fails the test with the reason when a call did not succeed; returns the success.
function ok<T extends { status: string }>(result: T, what: string): Extract<T, { status: 'success' }> {
  if (result.status !== 'success') throw new Error(`${what}: ${JSON.stringify(result)}`);
  return result as Extract<T, { status: 'success' }>;
}

// The four editable values of a settings object.
function editable(s: CalendarSettings): UpdateSettingsBody {
  return {
    cancellationNoticeHours: s.cancellationNoticeHours,
    minBookingNoticeHours: s.minBookingNoticeHours,
    bookingHorizonDays: s.bookingHorizonDays,
    maxFutureAppointmentsPerUser: s.maxFutureAppointmentsPerUser,
  };
}

// The Administrator's view of the band, through apiCall directly: CalendarService comes with
// docs/IMPLEMENTATION_PLAN.md step 54.
async function bandView(): Promise<CalendarView> {
  const from = addDays(today, BAND_OFFSET);
  const answer = await outcome(
    apiCall(API, admin, { method: 'GET', path: '/calendar', query: { from, to: addDays(from, BAND_DAYS - 1) }, codes: [] }),
    () => {},
  );
  if (answer.status !== 'ok') throw new Error(`GET /calendar: ${JSON.stringify(answer)}`);
  return answer.body as CalendarView;
}

// A date of the band with no window and no override: nothing of anyone else can overlap there.
// `taken` are dates this block already uses.
async function freeDate(taken: string[] = []): Promise<string> {
  const day = (await bandView()).days.find((d) => d.windows.length === 0 && d.hasOverride !== true && !taken.includes(d.date));
  if (!day) throw new Error(`no free date in the band from ${addDays(today, BAND_OFFSET)}: the calendar there is full of data this test does not own`);
  return day.date;
}

// A type of this run; fails clearly when data the test does not own fills the limit.
async function ownType(label: string): Promise<AvailabilityType> {
  const listed = ok(await loadTypes(admin), 'load types');
  const foreign = listed.types.filter((t) => !t.name.startsWith(PREFIX)).length;
  if (foreign >= CALENDAR_LIMITS.types) {
    throw new Error(`${foreign} types exist that this test does not own: the limit of ${CALENDAR_LIMITS.types} leaves no room`);
  }
  return ok(await createType(admin, `${PREFIX}${label}`), `create type ${label}`).type;
}

// Kept on disk before the first write, so that a killed run cannot lose them.
function saveSettings(settings: UpdateSettingsBody): void {
  writeFileSync(SAVED_SETTINGS, `${JSON.stringify(settings)}\n`);
}

// Writes the saved settings back and removes the file; nothing to do when there is none.
async function restoreSettings(): Promise<void> {
  if (!existsSync(SAVED_SETTINGS)) return;
  const saved = UpdateSettingsBody.safeParse(JSON.parse(readFileSync(SAVED_SETTINGS, 'utf8')));
  if (!saved.success) throw new Error(`${SAVED_SETTINGS.pathname} is not a settings object: fix or remove it by hand`);
  const back = ok(await updateSettings(admin, saved.data), 'write the saved settings back').settings;
  expect(editable(back)).toEqual(saved.data);
  rmSync(SAVED_SETTINGS);
}

// ── Clean-up: what a failed earlier run left, in the order the rules allow ───────────────────

async function cleanUp(): Promise<void> {
  const mine = ok(await loadTypes(admin), 'load types').types.filter((t) => t.name.startsWith(PREFIX));
  if (mine.length === 0) return;
  const ids = new Set(mine.map((t) => t.typeId));
  const r = rules(admin);
  // One-off windows and overrides of its types, on its band (before the patterns: deleting an
  // override lets the patterns apply again).
  for (const day of (await bandView()).days) {
    for (const w of day.windows.filter((w) => w.source === 'one_off' && ids.has(w.typeId))) {
      ok(await outcome(r.deleteWindowResult$, () => r.deleteWindow(w.sourceId as string)), `delete window ${w.sourceId}`);
    }
    const overrideWindows = day.windows.filter((w) => w.source === 'override');
    if (overrideWindows.length > 0 && overrideWindows.every((w) => ids.has(w.typeId))) {
      ok(await outcome(r.deleteOverrideResult$, () => r.deleteOverride(day.date)), `delete override ${day.date}`);
    }
  }
  const patterns = ok(await outcome(r.patternsResult$, () => r.loadPatterns()), 'load patterns').patterns;
  for (const p of patterns.filter((p) => ids.has(p.typeId))) {
    ok(await outcome(r.deletePatternResult$, () => r.deletePattern(p.patternId)), `delete pattern ${p.patternId}`);
  }
  for (const t of mine) ok(await removeType(admin, t.typeId), `remove type ${t.name}`);
}

async function removeUser(): Promise<void> {
  const s = users(admin);
  const result = await outcome(s.deleteUserResult$, () => s.deleteUser(USER));
  if (result.status === 'failure' && result.reason !== 'user_not_found') throw new Error(`could not remove ${USER}: ${result.reason}`);
}

// Runs `fn` with a fetch spy and checks that no request left.
async function noRequest<T>(fn: () => Promise<T>): Promise<T> {
  const spy = vi.spyOn(globalThis, 'fetch');
  try {
    const result = await fn();
    expect(spy).not.toHaveBeenCalled();
    return result;
  } finally {
    spy.mockRestore();
  }
}

beforeAll(async () => {
  admin = await signedIn('admin');
  stores.push(admin);
  await restoreSettings(); // an earlier run was killed between its write and its write-back
  const settings = ok(await loadSettings(admin), 'load settings').settings;
  today = localDateOf(new Date().toISOString(), settings.timeZone);
  await removeUser();
  await cleanUp();
  const s = users(admin);
  const password = ok(await outcome(s.createUserResult$, () => s.createUser(USER)), `create ${USER}`).user.password;
  const signed = await signIn(USER, password);
  ok(signed.result, `${USER} signs in`);
  user = signed.store;
  stores.push(user);
}, 180_000);

afterAll(async () => {
  try {
    await restoreSettings(); // a failure came between the write and the write-back
    await cleanUp();
    await removeUser();
  } finally {
    for (const store of stores) store.clear(); // stops the expiry timers
  }
}, 180_000);

// ── Settings (docs/SHARED_CALENDAR_SPEC.md section 11.1, routes 1 and 2) ─────────────────────

describe('settings', () => {
  it('admin reads, writes other values, and writes the values read back', async () => {
    const before = ok(await loadSettings(admin), 'load').settings;
    const original = editable(before);
    saveSettings(original); // before the first write
    const changed: UpdateSettingsBody = {
      cancellationNoticeHours: before.cancellationNoticeHours === 700 ? 701 : 700,
      minBookingNoticeHours: before.minBookingNoticeHours === 7 ? 8 : 7,
      bookingHorizonDays: before.bookingHorizonDays === 300 ? 301 : 300,
      maxFutureAppointmentsPerUser: before.maxFutureAppointmentsPerUser === 77 ? 78 : 77,
    };
    const saved = ok(await updateSettings(admin, changed), 'update').settings;
    expect(saved).toMatchObject({ ...changed, timeZone: before.timeZone, updatedBy: { username: 'admin', role: 'admin' } });

    // Both roles read them (docs/SHARED_CALENDAR_SPEC.md section 11.1, route 1).
    expect(ok(await loadSettings(user), 'load as user').settings).toMatchObject(changed);

    const back = ok(await updateSettings(admin, original), 'write back').settings;
    expect(editable(back)).toEqual(original);
    rmSync(SAVED_SETTINGS); // restored: afterAll has nothing to do
  });

  it(`${USER} updates them: forbidden, the settings unchanged`, async () => {
    const before = ok(await loadSettings(admin), 'load').settings;
    expect(await updateSettings(user, { ...editable(before), bookingHorizonDays: 1 })).toMatchObject({ status: 'failure', reason: 'forbidden' });
    expect(ok(await loadSettings(admin), 'load').settings).toEqual(before);
  });

  it('out of range: invalid_request with the field, no request sent', async () => {
    const before = ok(await loadSettings(admin), 'load').settings;
    const result = await noRequest(() => updateSettings(admin, { ...editable(before), bookingHorizonDays: 0 }));
    expect(result).toMatchObject({ status: 'failure', reason: 'invalid_request', message: expect.stringMatching(/^bookingHorizonDays: /) });
  });
});

// ── Types (docs/SHARED_CALENDAR_SPEC.md section 11.1, routes 3–6) ────────────────────────────

describe('types', () => {
  it('create (trimmed), duplicate name, rename, list as a User, remove, remove again', async () => {
    const created = ok(await createType(admin, `  ${PREFIX}Studio  `), 'create').type;
    expect(created.name).toBe(`${PREFIX}Studio`);

    expect(await createType(admin, `${PREFIX}STUDIO`)).toMatchObject({ status: 'failure', reason: 'type_name_exists' });

    const s = types(admin);
    const renamed = ok(await outcome(s.renameResult$, () => s.rename(created.typeId, `${PREFIX}Studio B`)), 'rename').type;
    expect(renamed).toMatchObject({ typeId: created.typeId, name: `${PREFIX}Studio B` });

    const listed = ok(await loadTypes(user), 'load as user').types; // both roles may read the types
    expect(listed.find((t) => t.typeId === created.typeId)?.name).toBe(`${PREFIX}Studio B`);

    expect(await removeType(admin, created.typeId)).toEqual({ status: 'success', typeId: created.typeId });
    expect(await removeType(admin, created.typeId)).toMatchObject({ status: 'failure', reason: 'type_not_found' });
  });

  it('rename an unknown type: type_not_found', async () => {
    const s = types(admin);
    expect(await outcome(s.renameResult$, () => s.rename(UNKNOWN_ID, `${PREFIX}x`))).toMatchObject({ reason: 'type_not_found' });
  });

  it(`${USER} creates a type: forbidden`, async () => {
    expect(await createType(user, `${PREFIX}by user`)).toMatchObject({ status: 'failure', reason: 'forbidden' });
  });

  it('an empty name: invalid_request, no request sent', async () => {
    expect(await noRequest(() => createType(admin, '   '))).toMatchObject({ reason: 'invalid_request', message: 'name: 1 to 40 characters' });
  });
});

// ── Weekly patterns (docs/SHARED_CALENDAR_SPEC.md section 11.1, routes 7–10) ─────────────────

describe('patterns', () => {
  it('create, list, overlap refused, update, type in use, delete, delete again', async () => {
    const type = await ownType('Pattern');
    const date = await freeDate();
    const r = rules(admin);
    const loaded = ok(await outcome(r.patternsResult$, () => r.loadPatterns()), 'load').patterns;
    const foreign = loaded.filter((p) => p.typeId !== type.typeId).length;
    if (foreign >= CALENDAR_LIMITS.patterns) throw new Error(`${foreign} patterns exist that this test does not own: no room under the limit`);

    const body = { weekday: weekdayOf(date), start: '08:00', end: '12:00', typeId: type.typeId, validFrom: date, validUntil: date };
    const created = ok(await outcome(r.createPatternResult$, () => r.createPattern(body)), 'create').pattern;
    expect(created).toMatchObject(body);

    const listed = ok(await outcome(r.patternsResult$, () => r.loadPatterns()), 'load').patterns;
    expect(listed.map((p) => p.patternId)).toContain(created.patternId);

    const overlapping = { ...body, start: '11:00', end: '13:00' };
    expect(await outcome(r.createPatternResult$, () => r.createPattern(overlapping))).toMatchObject({
      status: 'failure',
      reason: 'availability_overlap',
    });

    const updated = ok(await outcome(r.updatePatternResult$, () => r.updatePattern(created.patternId, { ...body, end: '11:00' })), 'update');
    expect(updated.pattern).toMatchObject({ patternId: created.patternId, end: '11:00' });

    expect(await removeType(admin, type.typeId)).toMatchObject({ status: 'failure', reason: 'type_in_use' });

    expect(await outcome(r.deletePatternResult$, () => r.deletePattern(created.patternId))).toEqual({ status: 'success', patternId: created.patternId });
    expect(await outcome(r.deletePatternResult$, () => r.deletePattern(created.patternId))).toMatchObject({ reason: 'pattern_not_found' });
    ok(await removeType(admin, type.typeId), 'remove type');
  });

  it('an unknown type in the body: type_not_found', async () => {
    const date = await freeDate();
    const r = rules(admin);
    const body = { weekday: weekdayOf(date), start: '08:00', end: '09:00', typeId: UNKNOWN_ID, validFrom: date, validUntil: date };
    expect(await outcome(r.createPatternResult$, () => r.createPattern(body))).toMatchObject({ reason: 'type_not_found' });
  });

  it(`${USER} lists the patterns: forbidden`, async () => {
    const r = rules(user);
    expect(await outcome(r.patternsResult$, () => r.loadPatterns())).toMatchObject({ status: 'failure', reason: 'forbidden' });
  });
});

// ── Date overrides (docs/SHARED_CALENDAR_SPEC.md section 11.1, routes 11 and 12) ─────────────

describe('overrides', () => {
  it('set (sorted by start), overlap refused, delete, delete again', async () => {
    const type = await ownType('Override');
    const date = await freeDate();
    const r = rules(admin);
    const late = { start: '14:00', end: '16:00', typeId: type.typeId };
    const early = { start: '10:00', end: '12:00', typeId: type.typeId };
    const set = ok(await outcome(r.setOverrideResult$, () => r.setOverride(date, [late, early])), 'set').override;
    expect(set).toMatchObject({ date, windows: [early, late] });

    const overlapping = [early, { ...late, start: '11:00' }];
    expect(await outcome(r.setOverrideResult$, () => r.setOverride(date, overlapping))).toMatchObject({ reason: 'availability_overlap' });

    expect(await outcome(r.deleteOverrideResult$, () => r.deleteOverride(date))).toEqual({ status: 'success', date });
    expect(await outcome(r.deleteOverrideResult$, () => r.deleteOverride(date))).toMatchObject({ reason: 'override_not_found' });
    ok(await removeType(admin, type.typeId), 'remove type');
  });

  it('yesterday: date_in_past (nothing is read or written)', async () => {
    const r = rules(admin);
    const windows = [{ start: '10:00', end: '11:00', typeId: UNKNOWN_ID }];
    expect(await outcome(r.setOverrideResult$, () => r.setOverride(addDays(today, -1), windows))).toMatchObject({ reason: 'date_in_past' });
  });

  it(`${USER} sets an override: forbidden`, async () => {
    const r = rules(user);
    expect(await outcome(r.setOverrideResult$, () => r.setOverride(addDays(today, BAND_OFFSET), []))).toMatchObject({ reason: 'forbidden' });
  });
});

// ── One-off windows (docs/SHARED_CALENDAR_SPEC.md section 11.1, routes 13 and 14) ────────────

describe('one-off windows', () => {
  it('create, overlap refused, type in use, delete, delete again', async () => {
    const type = await ownType('Window');
    const date = await freeDate();
    const r = rules(admin);
    const body = { date, start: '15:00', end: '17:00', typeId: type.typeId };
    const created = ok(await outcome(r.createWindowResult$, () => r.createWindow(body)), 'create').window;
    expect(created).toMatchObject(body);

    expect(await outcome(r.createWindowResult$, () => r.createWindow({ ...body, start: '16:00', end: '18:00' }))).toMatchObject({
      reason: 'availability_overlap',
    });
    expect(await removeType(admin, type.typeId)).toMatchObject({ reason: 'type_in_use' });

    expect(await outcome(r.deleteWindowResult$, () => r.deleteWindow(created.windowId))).toEqual({ status: 'success', windowId: created.windowId });
    expect(await outcome(r.deleteWindowResult$, () => r.deleteWindow(created.windowId))).toMatchObject({ reason: 'window_not_found' });
    ok(await removeType(admin, type.typeId), 'remove type');
  });

  it('yesterday: date_in_past', async () => {
    const r = rules(admin);
    const body = { date: addDays(today, -1), start: '15:00', end: '17:00', typeId: UNKNOWN_ID };
    expect(await outcome(r.createWindowResult$, () => r.createWindow(body))).toMatchObject({ reason: 'date_in_past' });
  });

  it('end before start: invalid_request with the field, no request sent', async () => {
    const r = rules(admin);
    const body = { date: addDays(today, BAND_OFFSET), start: '17:00', end: '15:00', typeId: UNKNOWN_ID };
    expect(await noRequest(() => outcome(r.createWindowResult$, () => r.createWindow(body)))).toMatchObject({
      reason: 'invalid_request',
      message: 'end: end must be after start',
    });
  });
});

// ── Users (docs/SHARED_CALENDAR_SPEC.md section 11.1, route 21) ──────────────────────────────

describe('users', () => {
  it(`admin lists the plain Users: ${USER} and alice, never admin`, async () => {
    const s = users(admin);
    const listed = ok(await outcome(s.listUsersResult$, () => s.listUsers()), 'list').users.map((u) => u.username);
    expect(listed).toEqual(expect.arrayContaining([USER, 'alice']));
    expect(listed).not.toContain('admin');
  });

  it(`${USER} lists the Users: forbidden`, async () => {
    const s = users(user);
    expect(await outcome(s.listUsersResult$, () => s.listUsers())).toMatchObject({ status: 'failure', reason: 'forbidden' });
  });
});
