import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import {
  addDays,
  CALENDAR_LIMITS,
  localDateOf,
  toInstant,
  weekdayOf,
  type AvailabilityType,
  type CalendarSettings,
  type CalendarView,
  type WeeklyPattern,
  UpdateSettingsBody,
} from '@shared-calendar/shared';
import { AppointmentsService } from '../../src/services/appointments.service';
import { AvailabilityRulesService } from '../../src/services/availability-rules.service';
import { AvailabilityTypesService } from '../../src/services/availability-types.service';
import { CalendarService } from '../../src/services/calendar.service';
import { CalendarSettingsService } from '../../src/services/calendar-settings.service';
import { SessionStore } from '../../src/services/session.store';
import { UsersService } from '../../src/services/users.service';
import { API, outcome, signedIn, signIn } from './local';

// The calendar journeys of docs/FRONTEND_SERVICES.md section 14.4: every calendar service and
// listUsers, against the back end's local stack. Runs only with RUN_INTEGRATION=1, never at the
// same time as the back end's journeys. The local calendar is shared with them and with the smoke
// test, so this file:
// - never resets the table and never deletes or changes what it did not create;
// - creates only types named `fe-calendar …` and items on dates about a year ahead (from today
//   + 330 days, a band of 31 days), each on a date that has no window and no override yet;
// - books only for its throw-away Users `fe-calendar` and `fe-calendar-b`. Appointments cannot be
//   deleted through the API: the cancelled ones, their events and the deleted-user markers of the
//   two Users stay in the table as history;
// - writes the settings back to the values it read (updatedAt/updatedBy stay changed). Those
//   values are kept in SAVED_SETTINGS (git-ignored) from before the first write until they are
//   written back, so a run killed in between (no afterAll) is repaired by the next run. The
//   appointment blocks set them for their run too, to book about a year ahead;
// - removes what an earlier failed run left, before and after: first the two Users (deleting a
//   User cancels its future appointments, which would otherwise block deleting their pattern and
//   type), then the one-off windows, overrides and patterns of its types, then the types.

const USER = 'fe-calendar';
// A second plain User, booked only by the Administrator: its appointments are what `fe-calendar`
// sees as anonymous `busy` intervals (docs/FRONTEND_SERVICES.md section 8, decision 43).
const USER_B = 'fe-calendar-b';
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
let zone: string; // the calendar's time zone, from the settings
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

// The first element, failing the test when there is none.
function first<T>(items: T[]): T {
  if (items.length === 0) throw new Error('expected at least one element');
  return items[0] as T;
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

function loadCalendar(store: SessionStore, from: string, to: string) {
  const s = new CalendarService(API, store);
  return outcome(s.calendarResult$, () => s.load(from, to));
}
function appointments(store: SessionStore) {
  return new AppointmentsService(API, store);
}

// The Administrator's view of the band.
async function bandView(): Promise<CalendarView> {
  const from = addDays(today, BAND_OFFSET);
  return ok(await loadCalendar(admin, from, addDays(from, BAND_DAYS - 1)), 'load the band').calendar;
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

// Deleting a User cancels its future appointments first (docs/ARCHITECTURE.md section 4,
// DELETE /users/{username}), so this comes before cleanUp().
async function removeUsers(): Promise<void> {
  const s = users(admin);
  for (const username of [USER, USER_B]) {
    const result = await outcome(s.deleteUserResult$, () => s.deleteUser(username));
    if (result.status === 'failure' && result.reason !== 'user_not_found') throw new Error(`could not remove ${username}: ${result.reason}`);
  }
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
  zone = settings.timeZone;
  today = localDateOf(new Date().toISOString(), zone);
  await removeUsers();
  await cleanUp();
  const s = users(admin);
  ok(await outcome(s.createUserResult$, () => s.createUser(USER_B)), `create ${USER_B}`);
  const password = ok(await outcome(s.createUserResult$, () => s.createUser(USER)), `create ${USER}`).user.password;
  const signed = await signIn(USER, password);
  ok(signed.result, `${USER} signs in`);
  user = signed.store;
  stores.push(user);
}, 180_000);

afterAll(async () => {
  try {
    await restoreSettings(); // a failure came between the write and the write-back
    await removeUsers();
    await cleanUp();
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

// ── Appointments: the helpers of the three blocks below ──────────────────────────────────────

// Registers, in the calling block, the settings it books under: a horizon of 365 days, no minimum
// notice and no limit, so that a User can book on the band about a year ahead. The cancellation
// notice keeps the value read (the body needs all four; at most 720 hours cannot block a cancel
// 330 days ahead). The values read are kept in SAVED_SETTINGS until afterAll writes them back
// (docs/FRONTEND_SERVICES.md section 8, decision 43).
function bookingSettings(): void {
  beforeAll(async () => {
    await restoreSettings(); // never overwrite values read that are not yet written back
    const read = editable(ok(await loadSettings(admin), 'load settings').settings);
    saveSettings(read); // before the write
    const bookable = { ...read, bookingHorizonDays: 365, minBookingNoticeHours: 0, maxFutureAppointmentsPerUser: null };
    ok(await updateSettings(admin, bookable), 'settings for booking');
  }, 60_000);
  afterAll(restoreSettings, 60_000);
}

type Bookable = { type: AvailabilityType; date: string; pattern: WeeklyPattern; at: (time: string) => string };

// A free date of the band with one window of a new type, 08:00–12:00 local, from a pattern valid on
// that date only. `at` turns a local time of that date into the instant the API wants.
async function bookableDate(label: string): Promise<Bookable> {
  const type = await ownType(label);
  const date = await freeDate();
  const r = rules(admin);
  const foreign = ok(await outcome(r.patternsResult$, () => r.loadPatterns()), 'load patterns').patterns.length;
  if (foreign >= CALENDAR_LIMITS.patterns) throw new Error(`${foreign} patterns exist that this test does not own: no room under the limit`);
  const body = { weekday: weekdayOf(date), start: '08:00', end: '12:00', typeId: type.typeId, validFrom: date, validUntil: date };
  const pattern = ok(await outcome(r.createPatternResult$, () => r.createPattern(body)), 'create pattern').pattern;
  return { type, date, pattern, at: (time) => toInstant(date, time, zone) };
}

// Removes the pattern and the type of bookableDate, once no booked appointment lies in them.
async function release({ type, pattern }: Bookable): Promise<void> {
  const r = rules(admin);
  ok(await outcome(r.deletePatternResult$, () => r.deletePattern(pattern.patternId)), 'delete pattern');
  ok(await removeType(admin, type.typeId), 'remove type');
}

function book(store: SessionStore, booking: Parameters<AppointmentsService['book']>[0]) {
  const s = appointments(store);
  return outcome(s.bookResult$, () => s.book(booking));
}
function cancel(store: SessionStore, appointmentId: string) {
  const s = appointments(store);
  return outcome(s.cancelResult$, () => s.cancel(appointmentId));
}
function list(store: SessionStore, query: Parameters<AppointmentsService['list']>[0]) {
  const s = appointments(store);
  return outcome(s.appointmentsResult$, () => s.list(query));
}

// ── The calendar view (docs/SHARED_CALENDAR_SPEC.md section 11.1, route 15) ──────────────────

// Explained in simple words in docs/journeys/frontend/calendar-view.md.
describe('calendar view', () => {
  bookingSettings();

  it(`a week: the Administrator sees sources and names; ${USER} its own appointment and ${USER_B}'s as busy`, async () => {
    const bookable = await bookableDate('View');
    const { type, date, pattern, at } = bookable;
    const mine = ok(await book(admin, { start: at('08:00'), username: USER }), `book for ${USER}`).appointment;
    const other = ok(await book(admin, { start: at('10:00'), username: USER_B, note: 'private note' }), `book for ${USER_B}`).appointment;
    const to = addDays(date, 6);
    const window = { start: at('08:00'), end: at('12:00'), typeId: type.typeId, typeName: type.name };

    const adminView = ok(await loadCalendar(admin, date, to), 'admin view').calendar;
    expect(adminView).toMatchObject({ timeZone: zone, from: date, to });
    expect(adminView.days.map((d) => d.date)).toEqual([0, 1, 2, 3, 4, 5, 6].map((n) => addDays(date, n)));
    const adminDay = first(adminView.days);
    expect(adminDay).toMatchObject({ date, weekday: weekdayOf(date), hasOverride: false, busy: [] });
    expect(adminDay.windows).toEqual([{ ...window, source: 'pattern', sourceId: pattern.patternId }]);
    const adminAppointments = adminView.appointments.filter((a) => a.date === date);
    expect(adminAppointments.map((a) => [a.appointmentId, a.username, a.cancellableUntil])).toEqual([
      [mine.appointmentId, USER, null],
      [other.appointmentId, USER_B, null],
    ]);

    // The User's view keeps the same service for reload (docs/SHARED_CALENDAR_SPEC.md section 16.3).
    const calendar = new CalendarService(API, user);
    const userView = ok(await outcome(calendar.calendarResult$, () => calendar.load(date, to)), 'user view').calendar;
    const day = first(userView.days);
    expect(day.windows).toEqual([window]); // no source, no sourceId
    expect(day).not.toHaveProperty('hasOverride');
    expect(day.slots).toEqual([
      { start: at('09:00'), end: at('10:00'), typeId: type.typeId },
      { start: at('11:00'), end: at('12:00'), typeId: type.typeId },
    ]);
    expect(day.busy).toEqual([{ start: at('10:00'), end: at('11:00') }]); // start and end only
    expect(userView.appointments.map((a) => a.appointmentId)).toEqual([mine.appointmentId]);
    expect(first(userView.appointments).cancellableUntil).toEqual(expect.any(String));
    const seen = JSON.stringify(userView);
    for (const hidden of [USER_B, other.appointmentId, 'private note']) expect(seen).not.toContain(hidden);

    ok(await cancel(admin, other.appointmentId), `cancel ${USER_B}'s`);
    const reloaded = ok(await outcome(calendar.calendarResult$, () => calendar.reload()), 'reload').calendar;
    expect(first(reloaded.days).busy).toEqual([]);
    expect(first(reloaded.days).slots.map((slot) => slot.start)).toEqual([at('09:00'), at('10:00'), at('11:00')]);

    ok(await cancel(admin, mine.appointmentId), `cancel ${USER}'s`);
    await release(bookable);
  });

  it('a range of 32 days: invalid_request with the field, no request sent', async () => {
    const from = addDays(today, BAND_OFFSET);
    expect(await noRequest(() => loadCalendar(user, from, addDays(from, 31)))).toMatchObject({
      reason: 'invalid_request',
      message: 'to: the range spans more than 31 days',
    });
  });

  it('reload before any load: invalid_request, no request sent', async () => {
    const calendar = new CalendarService(API, user);
    expect(await noRequest(() => outcome(calendar.calendarResult$, () => calendar.reload()))).toMatchObject({
      reason: 'invalid_request',
      message: 'nothing loaded yet',
    });
  });
});

// ── Appointments (docs/SHARED_CALENDAR_SPEC.md section 11.1, routes 16–20) ───────────────────

// Explained in simple words in docs/journeys/frontend/calendar-appointments.md.
describe('appointments', () => {
  bookingSettings();

  it(`book, slot taken, book for ${USER}, note, change, upcoming, cancel`, async () => {
    const bookable = await bookableDate('Appointments');
    const { type, date, at } = bookable;
    const a = appointments(user);

    // fe-calendar books a free slot for itself.
    const booked = ok(await outcome(a.bookResult$, () => a.book({ start: at('08:00') })), 'book').appointment;
    expect(booked).toMatchObject({ username: USER, start: at('08:00'), end: at('09:00'), date, typeId: type.typeId, status: 'booked', note: null });
    expect(booked.createdBy).toEqual({ username: USER, role: 'user' });
    expect(booked.cancellableUntil).toEqual(expect.any(String));

    expect(await book(admin, { start: at('08:00'), username: USER_B })).toMatchObject({ status: 'failure', reason: 'slot_taken' });

    // The Administrator books for fe-calendar, with a custom end only an Administrator may set.
    const forUser = ok(await book(admin, { start: at('10:00'), end: at('10:30'), username: USER }), 'book for the User').appointment;
    expect(forUser).toMatchObject({ username: USER, end: at('10:30'), createdBy: { username: 'admin', role: 'admin' }, cancellableUntil: null });

    const noted = ok(await outcome(a.updateNoteResult$, () => a.updateNote(booked.appointmentId, '  Bring shoes  ')), 'note').appointment;
    expect(noted).toMatchObject({ appointmentId: booked.appointmentId, note: 'Bring shoes' });

    // The change keeps the note (docs/SHARED_CALENDAR_SPEC.md R-CHG-03).
    const changed = ok(await outcome(a.changeResult$, () => a.change(booked.appointmentId, { start: at('09:00') })), 'change');
    expect(changed.cancelled).toMatchObject({
      appointmentId: booked.appointmentId,
      status: 'cancelled',
      cancelReason: 'changed',
      replacedBy: changed.booked.appointmentId,
    });
    expect(changed.booked).toMatchObject({ start: at('09:00'), status: 'booked', note: 'Bring shoes', replaces: booked.appointmentId });
    expect(await outcome(a.changeResult$, () => a.change(booked.appointmentId, { start: at('11:00') }))).toMatchObject({
      reason: 'appointment_not_active',
    });

    // upcoming: the User's own list, and the Administrator's for fe-calendar; status=booked by default.
    const expected = [changed.booked.appointmentId, forUser.appointmentId];
    const mine = ok(await list(user, { upcoming: 'true' }), 'upcoming as the User').appointments;
    expect(mine.filter((x) => x.date === date).map((x) => x.appointmentId)).toEqual(expected);
    expect(mine.every((x) => x.username === USER && x.status === 'booked' && x.cancellableUntil !== null)).toBe(true);
    const theirs = ok(await list(admin, { upcoming: 'true', username: USER }), 'upcoming for the User').appointments;
    expect(theirs.filter((x) => x.date === date).map((x) => x.appointmentId)).toEqual(expected);
    expect(theirs.every((x) => x.cancellableUntil === null)).toBe(true);
    // Every status of the date; an earlier block may have left a cancelled one there.
    const ids = [booked.appointmentId, ...expected];
    const history = ok(await list(user, { from: date, to: date, status: 'all' }), 'the date, every status').appointments;
    expect(history.filter((x) => ids.includes(x.appointmentId)).map((x) => [x.appointmentId, x.status])).toEqual([
      [booked.appointmentId, 'cancelled'],
      [changed.booked.appointmentId, 'booked'],
      [forUser.appointmentId, 'booked'],
    ]);

    const cancelled = ok(await outcome(a.cancelResult$, () => a.cancel(changed.booked.appointmentId)), 'cancel').appointment;
    expect(cancelled).toMatchObject({ status: 'cancelled', cancelReason: 'cancelled', cancelledBy: { username: USER, role: 'user' } });
    expect(await outcome(a.cancelResult$, () => a.cancel(changed.booked.appointmentId))).toMatchObject({ reason: 'appointment_not_active' });
    ok(await cancel(admin, forUser.appointmentId), 'cancel as the Administrator');
    expect(ok(await list(user, { upcoming: 'true' }), 'upcoming').appointments.filter((x) => x.date === date)).toEqual([]);

    await release(bookable);
  });

  it(`${USER} starts off the whole hour: the API answers invalid_request (the service sends it)`, async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    try {
      const start = toInstant(addDays(today, BAND_OFFSET), '08:15', zone);
      expect(await book(user, { start })).toMatchObject({ status: 'failure', reason: 'invalid_request' });
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it(`${USER} lists ${USER_B}'s appointments: forbidden`, async () => {
    expect(await list(user, { upcoming: 'true', username: USER_B })).toMatchObject({ status: 'failure', reason: 'forbidden' });
  });

  it('cancel an unknown appointment: appointment_not_found', async () => {
    expect(await cancel(user, UNKNOWN_ID)).toMatchObject({ status: 'failure', reason: 'appointment_not_found' });
  });

  it('a note of 501 characters: invalid_request with the field, no request sent', async () => {
    const a = appointments(user);
    expect(await noRequest(() => outcome(a.updateNoteResult$, () => a.updateNote(UNKNOWN_ID, 'x'.repeat(501))))).toMatchObject({
      reason: 'invalid_request',
      message: 'note: at most 500 characters',
    });
  });
});

// ── availability_conflict end to end (docs/SHARED_CALENDAR_SPEC.md section 6.7) ─────────────

describe('availability conflict', () => {
  bookingSettings();

  it('an override and a pattern delete that would strand a booked appointment: refused, with conflicts', async () => {
    const bookable = await bookableDate('Conflict');
    const { type, date, pattern, at } = bookable;
    const booked = ok(await book(user, { start: at('08:00') }), 'book').appointment;
    const conflict = { appointmentId: booked.appointmentId, username: USER, start: at('08:00'), end: at('09:00') };
    const r = rules(admin);

    const override = await outcome(r.setOverrideResult$, () => r.setOverride(date, [{ start: '10:00', end: '12:00', typeId: type.typeId }]));
    expect(override).toEqual({ status: 'failure', reason: 'availability_conflict', message: expect.any(String), conflicts: [conflict] });
    const removal = await outcome(r.deletePatternResult$, () => r.deletePattern(pattern.patternId));
    expect(removal).toMatchObject({ reason: 'availability_conflict', conflicts: [conflict] });
    expect(first(ok(await loadCalendar(admin, date, date), 'view').calendar.days).hasOverride).toBe(false); // nothing written

    ok(await cancel(user, booked.appointmentId), 'cancel');
    await release(bookable); // a cancelled appointment blocks nothing
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
