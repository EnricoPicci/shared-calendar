import { OneOffWindowBody, OverrideBody, toInstant, type AppointmentConflict, type AvailabilityType, type CalendarDay, type CalendarWindow, type WeeklyPattern } from '@shared-calendar/shared';
import { BehaviorSubject, ReplaySubject, Subject } from 'rxjs';
import type { Ask, Known } from '../../../src/logic/availability.screen';
import { DATE_NEEDED, DRAFT_FULL, DRAFT_OPEN, NOT_AVAILABLE, OVERLAPS_DRAFT, OWN_WINDOWS, PAST_DATE, PATTERNS_APPLY, STARTING_WINDOW, ZONE_PENDING, type WindowFields } from '../../../src/logic/date.model';
import { DateScreen, type DateRules, type DateState } from '../../../src/logic/date.screen';
import type {
  CreatePatternResult,
  CreateWindowResult,
  DeleteOverrideResult,
  DeletePatternResult,
  DeleteWindowResult,
  SetOverrideResult,
  UpdatePatternResult,
} from '../../../src/services/availability-rules.types';
import type { CreateTypeResult, RemoveTypeResult, RenameTypeResult } from '../../../src/services/availability-types.types';
import type { CalendarResult } from '../../../src/services/calendar.types';
import { POOL, STUDIO, view } from './fixtures';
import { useFarBrowserZone } from './zone';

// Fake services: result streams that replay their last value, as the real ones do, and spies;
// what the AvailabilityScreen knows is a subject the test controls. No network, no DOM. "Now"
// is a fixed moment handed to the object: Friday 20 November 2026, 23:30 in Rome, which is
// still Friday in UTC and already Saturday at noon in the browser's zone of these tests.

const NOW = new Date('2026-11-20T22:30:00.000Z');
const TODAY = '2026-11-20';
const MONDAY = '2026-11-23';
const TUESDAY = '2026-11-24';
const ROME = 'Europe/Rome';
const UNREACHABLE = 'The server cannot be reached. Check the connection and try again.';
const QUIET: Ask<never> = { about: '', busy: false, refusals: {}, failure: null, conflicts: null, done: false };
const START: DateState = {
  loading: false,
  field: { date: '' },
  refusal: null,
  unread: null,
  day: null,
  offers: { change: false, back: false },
  choices: [],
  draft: null,
  addFields: STARTING_WINDOW,
  add: QUIET,
  save: QUIET,
  windowFields: STARTING_WINDOW,
  window: QUIET,
  confirm: QUIET,
};
const STAMPS = { createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' };
const TYPES: AvailabilityType[] = [
  { typeId: POOL, name: 'Piscina', ...STAMPS },
  { typeId: STUDIO, name: 'Studio', ...STAMPS },
];
const P1 = '01M6PATTERN000000000000001';
const W1 = '01M6W1ND0W0000000000000001';
const pattern = (over: Partial<WeeklyPattern> = {}): WeeklyPattern => ({ patternId: P1, weekday: 1, start: '09:00', end: '13:00', typeId: STUDIO, validFrom: '2026-11-20', validUntil: null, ...STAMPS, ...over });
const KNOWN: Known = { zone: ROME, zoneWhy: null, types: TYPES, patterns: [pattern()] };
const NOT_KNOWN: Known = { zone: null, zoneWhy: null, types: null, patterns: null };
const CONFLICTS: AppointmentConflict[] = [{ appointmentId: 'appt-1', username: 'alice', start: '2026-11-23T08:00:00.000Z', end: '2026-11-23T09:00:00.000Z' }];
const IN_THE_WAY = { sentence: '1 appointment is in the way:', rows: [{ date: 'Mon 23 Nov', time: '09:00–10:00', username: 'alice' }] };
const failure = <R extends string>(reason: R) => ({ status: 'failure' as const, reason, message: 'for a developer' });
const fields = (start: string, end: string, typeId = STUDIO): WindowFields => ({ start, end, typeId });

// A window of the Administrator's calendar view, from local times of a date in Rome.
const seen = (date: string, start: string, end: string, typeId: string, typeName: string, source: CalendarWindow['source'], sourceId = date): CalendarWindow => ({ start: toInstant(date, start, ROME), end: toInstant(date, end, ROME), typeId, typeName, source, sourceId });
const PATTERN_WINDOW = (date = MONDAY) => seen(date, '09:00', '13:00', STUDIO, 'Studio', 'pattern', P1);
const EXTRA = seen(MONDAY, '18:00', '20:00', POOL, 'Piscina', 'one_off', W1);
// The answer of GET /calendar for one date.
const answer = (date: string, windows: CalendarWindow[], hasOverride = false, timeZone = ROME): CalendarResult => {
  const day: CalendarDay = { date, weekday: 1, windows, slots: [], busy: [], hasOverride };
  return { status: 'success', calendar: { ...view(date, { timeZone }), from: date, to: date, days: [day] } };
};

function screenOf(known: Known = KNOWN, now: Date = NOW) {
  const results = {
    calendar: new ReplaySubject<CalendarResult>(1),
    setOverride: new ReplaySubject<SetOverrideResult>(1),
    deleteOverride: new ReplaySubject<DeleteOverrideResult>(1),
    createWindow: new ReplaySubject<CreateWindowResult>(1),
    deleteWindow: new ReplaySubject<DeleteWindowResult>(1),
    createType: new ReplaySubject<CreateTypeResult>(1),
    renameType: new ReplaySubject<RenameTypeResult>(1),
    removeType: new ReplaySubject<RemoveTypeResult>(1),
    createPattern: new ReplaySubject<CreatePatternResult>(1),
    updatePattern: new ReplaySubject<UpdatePatternResult>(1),
    deletePattern: new ReplaySubject<DeletePatternResult>(1),
  };
  const known$ = new BehaviorSubject<Known>(known);
  const visible$ = new Subject<void>();
  const calendar = { load: vi.fn<(from: string, to: string) => void>(), calendarResult$: results.calendar.asObservable() };
  const types = { createResult$: results.createType.asObservable(), renameResult$: results.renameType.asObservable(), removeResult$: results.removeType.asObservable() };
  const rules = {
    setOverride: vi.fn<DateRules['setOverride']>(),
    deleteOverride: vi.fn<DateRules['deleteOverride']>(),
    createWindow: vi.fn<DateRules['createWindow']>(),
    deleteWindow: vi.fn<DateRules['deleteWindow']>(),
    setOverrideResult$: results.setOverride.asObservable(),
    deleteOverrideResult$: results.deleteOverride.asObservable(),
    createWindowResult$: results.createWindow.asObservable(),
    deleteWindowResult$: results.deleteWindow.asObservable(),
    createPatternResult$: results.createPattern.asObservable(),
    updatePatternResult$: results.updatePattern.asObservable(),
    deletePatternResult$: results.deletePattern.asObservable(),
  };
  const screen = new DateScreen(known$, calendar, types, rules, () => now, visible$);
  const states: DateState[] = [];
  screen.date$.subscribe((s) => states.push(s)); // the view subscribes first
  const last = () => states.at(-1)!;
  // Started, with a date shown and read: Monday, as the weekly pattern gives it unless told otherwise.
  const shown = (windows: CalendarWindow[] = [PATTERN_WINDOW()], hasOverride = false, date = MONDAY) => {
    const started = screen.start();
    screen.show(date);
    results.calendar.next(answer(date, windows, hasOverride));
    return started;
  };
  // Started on a day with a draft open: the pattern's window 09:00–13:00 Studio.
  const editing = () => {
    const started = shown();
    screen.edit();
    return started;
  };
  const loads = () => calendar.load.mock.calls;
  // How many times each write was called: [setOverride, deleteOverride, createWindow, deleteWindow].
  const writes = () => [rules.setOverride, rules.deleteOverride, rules.createWindow, rules.deleteWindow].map((spy) => spy.mock.calls.length);
  const draft = () => last().draft?.rows.map((row) => `${row.time} ${row.typeName}`) ?? null;
  return { screen, results, known$, visible$, calendar, rules, states, last, shown, editing, loads, writes, draft };
}

// Test names: R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
describe('DateScreen', () => {
  useFarBrowserZone();

  describe('before start()', () => {
    it('the stream says nothing is shown, and nothing is read: not what is known, not a date', () => {
      const { screen, known$, last, loads, states } = screenOf();
      expect(last()).toEqual(START);
      screen.show(MONDAY);
      screen.retry();
      screen.edit();
      screen.addWindow(fields('18:00', '19:00'));
      screen.close();
      screen.back();
      screen.removeWindow(W1);
      screen.add(fields('18:00', '19:00'));
      screen.remove(0);
      screen.discard();
      screen.save();
      expect([loads(), states.length, known$.observed]).toEqual([[], 1, false]);
    });
  });

  describe('start(): what is known', () => {
    it('nothing is read; the date field starts on today, the calendar\'s, and the types are the choices of the two forms', () => {
      const { screen, last, loads, writes } = screenOf();
      screen.start();
      expect(last()).toEqual({ ...START, field: { date: TODAY }, choices: [{ value: POOL, label: 'Piscina' }, { value: STUDIO, label: 'Studio' }] });
      expect([loads(), writes()]).toEqual([[], [0, 0, 0, 0]]);
    });

    it('"today" is the calendar\'s, not the browser\'s and not UTC\'s: at 23:30 in Rome it is still Friday; in Auckland it is already Saturday', () => {
      const rome = screenOf();
      rome.screen.start();
      expect(rome.last().field.date).toBe('2026-11-20');
      const auckland = screenOf({ ...KNOWN, zone: 'Pacific/Auckland' });
      auckland.screen.start();
      expect(auckland.last().field.date).toBe('2026-11-21');
      const honolulu = screenOf({ ...KNOWN, zone: 'Pacific/Honolulu' }, new Date('2026-11-21T03:00:00.000Z'));
      honolulu.screen.start();
      expect(honolulu.last().field.date).toBe('2026-11-20');
    });

    it('while the zone is not known the field stays empty; it is filled once, when the zone arrives, and not again at a later notification', () => {
      const { screen, known$, last } = screenOf(NOT_KNOWN);
      screen.start();
      expect(last().field).toEqual({ date: '' });
      known$.next({ ...NOT_KNOWN, types: TYPES });
      expect(last().field).toEqual({ date: '' });
      known$.next(KNOWN);
      const filled = last().field;
      expect(filled).toEqual({ date: TODAY });
      known$.next({ ...KNOWN, patterns: [] });
      expect(last().field).toBe(filled);
    });

    it('the same types known again keep the same choices object; other types bring another', () => {
      const { screen, known$, last } = screenOf();
      screen.start();
      const choices = last().choices;
      known$.next({ ...KNOWN, types: [...TYPES] });
      expect(last().choices).toBe(choices);
      known$.next({ ...KNOWN, types: [TYPES[1]!] });
      expect(last().choices).toEqual([{ value: STUDIO, label: 'Studio' }]);
    });
  });

  describe('show(): the date is checked before any call', () => {
    it.each([
      ['an empty field', '', DATE_NEEDED],
      ['a text that is not a date', '2026-02-30', DATE_NEEDED],
      ['yesterday', '2026-11-19', PAST_DATE],
    ])('%s is refused under the field, with no request and nothing shown', (_what, text, refusal) => {
      const { screen, last, loads } = screenOf();
      screen.start();
      screen.show(text);
      expect([last().refusal, last().day, last().loading, loads()]).toEqual([refusal, null, false, []]);
    });

    it('today and tomorrow are read: one load of that date alone', () => {
      const { screen, last, loads } = screenOf();
      screen.start();
      screen.show(TODAY);
      expect([last().loading, last().refusal, loads()]).toEqual([true, null, [[TODAY, TODAY]]]);
      screen.show('2026-11-21');
      expect(loads()).toEqual([[TODAY, TODAY], ['2026-11-21', '2026-11-21']]);
    });

    it('"today" for a past date is the calendar\'s: at the same moment Friday 20 is accepted in Rome, where it is still Friday, and refused in Auckland, where it is already Saturday', () => {
      const rome = screenOf();
      rome.screen.start();
      rome.screen.show('2026-11-20');
      expect(rome.last().refusal).toBeNull();
      const auckland = screenOf({ ...KNOWN, zone: 'Pacific/Auckland' });
      auckland.screen.start();
      auckland.screen.show('2026-11-20');
      expect([auckland.last().refusal, auckland.loads()]).toEqual([PAST_DATE, []]);
      // The browser's zone of these tests is already on Saturday too: its date plays no part in Rome.
      expect(new Date(NOW).getDate()).toBe(21);
    });

    it('a refusal goes at the next date that is accepted, and a past date leaves the day on show as it is', () => {
      const { screen, last, shown, loads } = screenOf();
      shown();
      const day = last().day;
      screen.show('2026-11-19');
      expect([last().refusal, last().day, loads().length]).toEqual([PAST_DATE, day, 1]);
      screen.show(MONDAY);
      expect([last().refusal, loads().length]).toEqual([null, 2]);
    });

    it('while the zone is not known because the settings are still being read, "Show" is refused in words, with no request', () => {
      const { screen, last, loads } = screenOf(NOT_KNOWN);
      screen.start();
      screen.show(MONDAY);
      expect([last().refusal, loads()]).toEqual([ZONE_PENDING, []]);
    });

    it('while the zone is not known because the settings could not be read, "Show" is refused with the failure of that read, with no request', () => {
      const { screen, last, loads } = screenOf({ ...NOT_KNOWN, zoneWhy: UNREACHABLE });
      screen.start();
      screen.show(MONDAY);
      expect([last().refusal, loads()]).toEqual([UNREACHABLE, []]);
    });

    it('once the settings are read the sentence goes by itself, and the same "Show" is followed', () => {
      const { screen, known$, last, loads } = screenOf({ ...NOT_KNOWN, zoneWhy: UNREACHABLE });
      screen.start();
      screen.show(MONDAY);
      known$.next({ ...NOT_KNOWN, zoneWhy: 'Something went wrong on the server. Please try again in a moment.' });
      expect(last().refusal).toBe(UNREACHABLE);
      known$.next(KNOWN);
      expect([last().refusal, loads()]).toEqual([null, []]);
      screen.show(MONDAY);
      expect(loads()).toEqual([[MONDAY, MONDAY]]);
    });

    it('a refusal about the date itself does not go when what is known changes', () => {
      const { screen, known$, last } = screenOf();
      screen.start();
      screen.show('');
      known$.next({ ...KNOWN, patterns: [] });
      expect(last().refusal).toBe(DATE_NEEDED);
    });
  });

  describe('the read of a date', () => {
    it('the day as the weekly patterns give it and as it is now say the same on a day with no override; its actions are offered, less the way back', () => {
      const { last, shown } = screenOf();
      shown();
      const { day, offers, loading, unread } = last();
      expect([loading, unread, offers]).toEqual([false, null, { change: true, back: false }]);
      expect([day!.date, day!.patterns, day!.patternsNone, day!.which, day!.own, day!.extras]).toEqual(['Monday 23 November 2026', [{ time: '09:00 – 13:00', typeName: 'Studio' }], null, PATTERNS_APPLY, [], []]);
    });

    it('a day with an override says so, lists its own windows and its extra ones, and offers the way back', () => {
      const { last, shown } = screenOf();
      shown([seen(MONDAY, '10:00', '12:00', STUDIO, 'Studio', 'override'), EXTRA], true);
      const { day, offers } = last();
      expect([day!.which, day!.own, day!.extras.map((extra) => [extra.windowId, extra.time]), offers]).toEqual([OWN_WINDOWS, [{ time: '10:00 – 12:00', typeName: 'Studio' }], [[W1, '18:00 – 20:00']], { change: true, back: true }]);
      // The patterns' description is the patterns', whatever the day has now.
      expect(day!.patterns).toEqual([{ time: '09:00 – 13:00', typeName: 'Studio' }]);
    });

    it('the times are read in the zone the view names', () => {
      const { screen, results, last } = screenOf({ ...KNOWN, zone: 'Asia/Kolkata' });
      screen.start();
      screen.show(MONDAY);
      const window = { start: toInstant(MONDAY, '09:30', 'Asia/Kolkata'), end: toInstant(MONDAY, '11:00', 'Asia/Kolkata'), typeId: STUDIO, typeName: 'Studio', source: 'override' as const, sourceId: MONDAY };
      results.calendar.next(answer(MONDAY, [window], true, 'Asia/Kolkata'));
      expect(last().day!.own).toEqual([{ time: '09:30 – 11:00', typeName: 'Studio' }]);
    });

    it('a read that fails is said in the place of the day, in plain words, and retry() reads the same date again', () => {
      const { screen, results, last, loads } = screenOf();
      screen.start();
      screen.show(MONDAY);
      results.calendar.next(failure('network'));
      expect([last().loading, last().unread, last().day, last().offers]).toEqual([false, UNREACHABLE, null, { change: false, back: false }]);
      screen.retry();
      expect([last().loading, last().unread, loads()]).toEqual([true, UNREACHABLE, [[MONDAY, MONDAY], [MONDAY, MONDAY]]]);
      results.calendar.next(answer(MONDAY, [PATTERN_WINDOW()]));
      expect([last().unread, last().day!.date]).toEqual([null, 'Monday 23 November 2026']);
    });

    it('a day that could not be read again is taken off the screen', () => {
      const { screen, results, last, shown } = screenOf();
      shown();
      screen.retry();
      results.calendar.next(failure('internal_error'));
      expect([last().day, last().unread]).toEqual([null, 'Something went wrong on the server. Please try again in a moment.']);
    });

    it('an answer that does not hold the date asked for is a failure, in the general words', () => {
      const { screen, results, last } = screenOf();
      screen.start();
      screen.show(MONDAY);
      results.calendar.next(answer(TUESDAY, []));
      expect([last().day, last().unread]).toEqual([null, 'Something went wrong. Please try again.']);
    });

    it('the same date shown again is read again and keeps its day meanwhile; the same day read again keeps the same object', () => {
      const { screen, results, last, shown, loads } = screenOf();
      shown();
      const day = last().day;
      screen.show(MONDAY);
      expect([last().day, last().loading, loads().length]).toEqual([day, true, 2]);
      results.calendar.next(answer(MONDAY, [PATTERN_WINDOW()]));
      expect(last().day).toBe(day);
    });

    it('another date shown takes the day on show off the screen, and an earlier failure with it', () => {
      const { screen, results, last, shown } = screenOf();
      shown();
      screen.show(TUESDAY);
      expect([last().day, last().loading]).toEqual([null, true]);
      results.calendar.next(failure('network'));
      screen.show(MONDAY);
      expect([last().unread, last().day]).toEqual([null, null]);
    });

    it('what is known arriving later changes the day on show: the patterns\' hours and the names', () => {
      const { known$, last, shown } = screenOf();
      shown();
      known$.next({ ...KNOWN, patterns: [pattern({ start: '08:00', end: '12:00', typeId: POOL })] });
      expect(last().day!.patterns).toEqual([{ time: '08:00 – 12:00', typeName: 'Piscina' }]);
      known$.next({ ...KNOWN, patterns: null });
      expect([last().day!.patterns, last().day!.patternsNone]).toEqual([[], 'The weekly patterns could not be read.']);
    });
  });

  describe('"this day only": the windows being put together', () => {
    it('edit() starts from the windows the weekly patterns give the day; nothing is sent, and the day\'s other actions give way', () => {
      const { last, editing, draft, writes } = screenOf();
      editing();
      expect([draft(), last().draft!.empty, last().offers, writes()]).toEqual([['09:00 – 13:00 Studio'], null, { change: false, back: false }, [0, 0, 0, 0]]);
    });

    it('edit() on a day with an override starts from the override\'s own windows, not from the patterns\'', () => {
      const { screen, shown, draft } = screenOf();
      shown([seen(MONDAY, '14:00', '16:00', POOL, 'Piscina', 'override'), seen(MONDAY, '10:00', '12:00', STUDIO, 'Studio', 'override'), EXTRA], true);
      screen.edit();
      expect(draft()).toEqual(['10:00 – 12:00 Studio', '14:00 – 16:00 Piscina']);
    });

    it('edit() does nothing while no day is on show, and nothing to a draft that is open', () => {
      const { screen, last, draft } = screenOf();
      screen.start();
      screen.edit();
      expect(last().draft).toBeNull();
      screen.show(MONDAY);
      screen.edit();
      expect(last().draft).toBeNull();
      const open = screenOf();
      open.editing();
      open.screen.remove(0);
      open.screen.edit();
      expect([open.draft(), draft()]).toEqual([[], null]);
    });

    it('add(): a window accepted enters the list, by start, and the form goes back to its starting values', () => {
      const { screen, last, editing, draft, writes } = screenOf();
      editing();
      const before = last().addFields;
      screen.add(fields('14:00', '16:00', POOL));
      expect([draft(), last().add, last().addFields, last().addFields === before]).toEqual([['09:00 – 13:00 Studio', '14:00 – 16:00 Piscina'], QUIET, STARTING_WINDOW, false]);
      screen.add(fields('07:00', '08:00'));
      expect([draft(), writes()]).toEqual([['07:00 – 08:00 Studio', '09:00 – 13:00 Studio', '14:00 – 16:00 Piscina'], [0, 0, 0, 0]]);
    });

    it('add(): each refusal is said, the list and what was chosen are left, and nothing is sent', () => {
      const { screen, last, editing, draft, writes } = screenOf();
      editing();
      const before = { rows: last().draft, addFields: last().addFields };
      screen.add(fields('15:00', '15:00', ''));
      expect(last().add).toEqual({ ...QUIET, refusals: { end: 'End must be later than Start.', typeId: 'Type must be chosen.' } });
      screen.add(fields('12:00', '14:00', POOL));
      expect(last().add).toEqual({ ...QUIET, refusals: { start: OVERLAPS_DRAFT, end: '' } });
      expect([last().draft === before.rows, last().addFields === before.addFields, draft(), writes()]).toEqual([true, true, ['09:00 – 13:00 Studio'], [0, 0, 0, 0]]);
      // A window that touches is accepted, and the refusal goes.
      screen.add(fields('13:00', '14:00', POOL));
      expect([draft(), last().add]).toEqual([['09:00 – 13:00 Studio', '13:00 – 14:00 Piscina'], QUIET]);
    });

    it('add(): the eleventh window is refused as the form\'s failure', () => {
      const { screen, last, editing, draft } = screenOf();
      editing();
      for (let hour = 13; hour < 22; hour += 1) screen.add(fields(`${hour}:00`, `${hour + 1}:00`));
      expect(draft()).toHaveLength(10);
      screen.add(fields('22:00', '23:00'));
      expect([draft()!.length, last().add]).toEqual([10, { ...QUIET, failure: DRAFT_FULL }]);
    });

    it('remove(): the window in that place goes, the others keep their order; the last one gone leaves the sentence of an empty list', () => {
      const { screen, last, editing, draft } = screenOf();
      editing();
      screen.add(fields('14:00', '16:00', POOL));
      screen.add(fields('17:00', '18:00'));
      screen.remove(1);
      expect(draft()).toEqual(['09:00 – 13:00 Studio', '17:00 – 18:00 Studio']);
      screen.remove(0);
      screen.remove(0);
      expect([draft(), last().draft!.empty]).toEqual([[], 'No window is left: saved like this, the day is not available.']);
    });

    it('discard(): the draft is gone, the day is as it was, and nothing was sent or read', () => {
      const { screen, last, editing, loads, writes } = screenOf();
      editing();
      const day = last().day;
      screen.add(fields('14:00', '16:00', POOL));
      screen.add(fields('14:00', '16:00', POOL));
      screen.discard();
      expect([last().draft, last().add, last().day, last().offers, loads().length, writes()]).toEqual([null, QUIET, day, { change: true, back: false }, 1, [0, 0, 0, 0]]);
    });

    it('save(): one setOverride with the date on show and the whole list, a body the shared schema accepts unchanged; busy meanwhile', () => {
      const { screen, rules, last, editing } = screenOf();
      editing();
      screen.remove(0);
      screen.add(fields('10:00', '12:00'));
      screen.add(fields('14:00', '24:00', POOL));
      screen.save();
      const windows = [
        { start: '10:00', end: '12:00', typeId: STUDIO },
        { start: '14:00', end: '24:00', typeId: POOL },
      ];
      expect(rules.setOverride.mock.calls).toEqual([[MONDAY, windows]]);
      expect(OverrideBody.parse({ windows: rules.setOverride.mock.calls[0]![1] })).toEqual({ windows });
      expect(last().save).toEqual({ ...QUIET, busy: true });
    });

    it('save(): an empty draft is sent as no window', () => {
      const { screen, rules, editing } = screenOf();
      editing();
      screen.remove(0);
      screen.save();
      expect(rules.setOverride.mock.calls).toEqual([[MONDAY, []]]);
      expect(OverrideBody.parse({ windows: [] })).toEqual({ windows: [] });
    });

    it('a save that succeeds: the draft is gone and the day is read again', () => {
      const { screen, results, last, editing, loads } = screenOf();
      editing();
      screen.save();
      results.setOverride.next({ status: 'success', override: { date: MONDAY, windows: [], updatedAt: STAMPS.updatedAt } });
      expect([last().draft, last().save, last().loading, last().offers.change, loads()]).toEqual([null, QUIET, true, true, [[MONDAY, MONDAY], [MONDAY, MONDAY]]]);
      results.calendar.next(answer(MONDAY, [seen(MONDAY, '09:00', '13:00', STUDIO, 'Studio', 'override')], true));
      expect([last().day!.which, last().offers]).toEqual([OWN_WINDOWS, { change: true, back: true }]);
    });

    it.each([
      ['a code of the server', 'availability_overlap', 'Another window of the same day covers part of these hours, whatever its type. Choose other hours.'],
      ['a transport reason', 'network', UNREACHABLE],
      ['a date that became past', 'date_in_past', 'This date is now in the past, so it can no longer be changed.'],
    ])('a save that fails with %s: the failure in plain words, the draft kept, and the day read again all the same', (_what, reason, sentence) => {
      const { screen, results, last, editing, draft, loads } = screenOf();
      editing();
      screen.add(fields('14:00', '16:00', POOL));
      screen.save();
      results.setOverride.next(failure(reason) as SetOverrideResult);
      expect([last().save, draft(), loads().length]).toEqual([{ ...QUIET, failure: sentence }, ['09:00 – 13:00 Studio', '14:00 – 16:00 Piscina'], 2]);
      // The same button works again.
      screen.save();
      expect([last().save, loads().length]).toEqual([{ ...QUIET, busy: true }, 2]);
    });

    it('a save refused with availability_conflict carries the appointments in the way, in the calendar\'s zone; gone at the next try', () => {
      const { screen, results, last, editing } = screenOf();
      editing();
      screen.save();
      results.setOverride.next({ ...failure('availability_conflict'), conflicts: CONFLICTS });
      expect(last().save).toEqual({ ...QUIET, failure: 'This would leave booked appointments outside the hours open for booking. Cancel or move them in the week first.', conflicts: IN_THE_WAY });
      screen.save();
      expect(last().save).toEqual({ ...QUIET, busy: true });
    });

    it('while a save is under way a second one is not taken, and the windows are left as they were sent', () => {
      const { screen, rules, editing, draft } = screenOf();
      editing();
      screen.save();
      screen.save();
      screen.add(fields('14:00', '16:00', POOL));
      screen.remove(0);
      screen.discard();
      expect([rules.setOverride.mock.calls.length, draft()]).toEqual([1, ['09:00 – 13:00 Studio']]);
    });

    it('"Show" while a draft is open is refused under the date field, with no request, for the same date and for another; the draft keeps its windows', () => {
      const { screen, last, editing, draft, loads } = screenOf();
      editing();
      screen.show(TUESDAY);
      expect([last().refusal, draft(), loads().length]).toEqual([DRAFT_OPEN, ['09:00 – 13:00 Studio'], 1]);
      screen.show(MONDAY);
      expect([last().refusal, loads().length]).toEqual([DRAFT_OPEN, 1]);
    });

    it('that sentence goes when the draft is discarded, and the same "Show" then goes', () => {
      const { screen, last, editing, loads } = screenOf();
      editing();
      screen.show(TUESDAY);
      screen.discard();
      expect(last().refusal).toBeNull();
      screen.show(TUESDAY);
      expect(loads()).toEqual([[MONDAY, MONDAY], [TUESDAY, TUESDAY]]);
    });

    it('that sentence goes when the draft is saved, and stays when the save fails', () => {
      const { screen, results, last, editing } = screenOf();
      editing();
      screen.show(TUESDAY);
      screen.save();
      results.setOverride.next(failure('network'));
      expect(last().refusal).toBe(DRAFT_OPEN);
      screen.save();
      results.setOverride.next({ status: 'success', override: { date: MONDAY, windows: [], updatedAt: STAMPS.updatedAt } });
      expect(last().refusal).toBeNull();
    });

    it('a draft discarded or saved with no refusal under the date field leaves that field\'s sentence alone', () => {
      const { screen, results, last, editing } = screenOf();
      editing();
      screen.discard();
      expect(last().refusal).toBeNull();
      screen.edit();
      screen.save();
      results.setOverride.next({ status: 'success', override: { date: MONDAY, windows: [], updatedAt: STAMPS.updatedAt } });
      expect(last().refusal).toBeNull();
    });

    it('a list of types that arrives while a draft is open: the draft keeps its windows, with the new names; the same types keep the same rows object', () => {
      const { known$, last, editing, draft } = screenOf();
      editing();
      const rows = last().draft;
      known$.next({ ...KNOWN, types: [...TYPES] });
      expect(last().draft).toBe(rows);
      known$.next({ ...KNOWN, types: [{ ...TYPES[1]!, name: 'Sala' }] });
      expect(draft()).toEqual(['09:00 – 13:00 Sala']);
      known$.next({ ...KNOWN, types: null });
      expect(draft()).toEqual(['09:00 – 13:00 Unknown type']);
    });

    it('the tab shown again while a draft is open: the day is read again, and the draft keeps its windows whatever the day now is', () => {
      const { results, visible$, editing, draft, loads } = screenOf();
      editing();
      visible$.next();
      expect(loads().length).toBe(2);
      results.calendar.next(answer(MONDAY, [], true));
      expect(draft()).toEqual(['09:00 – 13:00 Studio']);
    });

    it('a read of the day that fails while a draft is open: the day is taken off, the failure is said, and the draft keeps its windows and can still be saved', () => {
      const { screen, rules, results, visible$, last, editing, draft } = screenOf();
      editing();
      visible$.next();
      results.calendar.next(failure('network'));
      expect([last().day, last().unread, draft()]).toEqual([null, UNREACHABLE, ['09:00 – 13:00 Studio']]);
      screen.save();
      expect(rules.setOverride.mock.calls).toEqual([[MONDAY, [{ start: '09:00', end: '13:00', typeId: STUDIO }]]]);
    });
  });

  describe('an extra window', () => {
    it('addWindow(): one createWindow on the date on show, a body the shared schema accepts unchanged; busy meanwhile', () => {
      const { screen, rules, last, shown } = screenOf();
      shown();
      screen.addWindow(fields('18:00', '20:00', POOL));
      const body = { date: MONDAY, start: '18:00', end: '20:00', typeId: POOL };
      expect(rules.createWindow.mock.calls).toEqual([[body]]);
      expect(OneOffWindowBody.parse(rules.createWindow.mock.calls[0]![0])).toEqual(body);
      expect(last().window).toEqual({ ...QUIET, busy: true });
    });

    it('fields in fault are said under them, with no call, and what was chosen stays', () => {
      const { screen, last, shown, writes } = screenOf();
      shown();
      const before = last().windowFields;
      screen.addWindow(fields('18:00', '18:00', ''));
      expect([last().window, last().windowFields === before, writes()]).toEqual([{ ...QUIET, refusals: { end: 'End must be later than Start.', typeId: 'Type must be chosen.' } }, true, [0, 0, 0, 0]]);
    });

    it('nothing is added while no date is on show', () => {
      const { screen, last, writes } = screenOf();
      screen.start();
      screen.addWindow(fields('18:00', '20:00'));
      expect([last().window, writes()]).toEqual([QUIET, [0, 0, 0, 0]]);
    });

    it('a create that succeeds: done, the form back to its starting values, and the day read again', () => {
      const { screen, results, last, shown, loads } = screenOf();
      shown();
      const before = last().windowFields;
      screen.addWindow(fields('18:00', '20:00', POOL));
      results.createWindow.next({ status: 'success', window: { windowId: W1, date: MONDAY, start: '18:00', end: '20:00', typeId: POOL, createdAt: STAMPS.createdAt } });
      expect([last().window, last().windowFields, last().windowFields === before, loads().length]).toEqual([{ ...QUIET, done: true }, STARTING_WINDOW, false, 2]);
      results.calendar.next(answer(MONDAY, [PATTERN_WINDOW(), EXTRA]));
      expect(last().day!.extras.map((extra) => extra.time)).toEqual(['18:00 – 20:00']);
    });

    it.each([
      ['an overlap', 'availability_overlap', 'Another window of the same day covers part of these hours, whatever its type. Choose other hours.'],
      ['the limit of a date', 'limit_reached', 'A day can hold 10 extra windows at most. Delete one to add another.'],
      ['a type that is gone', 'type_not_found', 'This type no longer exists.'],
      ['a transport reason', 'server', 'The server is not answering as it should. Please try again in a moment.'],
    ])('a create that fails with %s: the failure in plain words, what was chosen kept, and the day read again all the same', (_what, reason, sentence) => {
      const { screen, results, last, shown, loads } = screenOf();
      shown();
      const before = last().windowFields;
      screen.addWindow(fields('18:00', '20:00', POOL));
      results.createWindow.next(failure(reason) as CreateWindowResult);
      expect([last().window, last().windowFields === before, loads().length]).toEqual([{ ...QUIET, failure: sentence }, true, 2]);
    });

    it('while one is being added a second is not taken, sent or refused', () => {
      const { screen, rules, last, shown } = screenOf();
      shown();
      screen.addWindow(fields('18:00', '20:00', POOL));
      screen.addWindow(fields('20:00', '21:00', POOL));
      screen.addWindow(fields('20:00', '20:00', ''));
      expect([rules.createWindow.mock.calls.length, last().window]).toEqual([1, { ...QUIET, busy: true }]);
    });

    it('an extra window can be added while a draft is open, and the draft keeps its windows', () => {
      const { screen, rules, results, editing, draft } = screenOf();
      editing();
      screen.addWindow(fields('18:00', '20:00', POOL));
      results.createWindow.next({ status: 'success', window: { windowId: W1, date: MONDAY, start: '18:00', end: '20:00', typeId: POOL, createdAt: STAMPS.createdAt } });
      expect([rules.createWindow.mock.calls.length, draft()]).toEqual([1, ['09:00 – 13:00 Studio']]);
    });
  });

  describe('the three actions the dialog confirms', () => {
    it('close(): "not available" is one setOverride with no window on the date on show; busy meanwhile, about "close"', () => {
      const { screen, rules, last, shown } = screenOf();
      shown();
      screen.close();
      expect([rules.setOverride.mock.calls, last().confirm]).toEqual([[[MONDAY, []]], { ...QUIET, about: 'close', busy: true }]);
    });

    it('back(): the way back to the weekly patterns is one deleteOverride of the date on show, about "back"', () => {
      const { screen, rules, last, shown } = screenOf();
      shown([], true);
      screen.back();
      expect([rules.deleteOverride.mock.calls, last().confirm]).toEqual([[[MONDAY]], { ...QUIET, about: 'back', busy: true }]);
    });

    it('removeWindow(): one deleteWindow with the id, which the outcome is about', () => {
      const { screen, rules, last, shown } = screenOf();
      shown([PATTERN_WINDOW(), EXTRA]);
      screen.removeWindow(W1);
      expect([rules.deleteWindow.mock.calls, last().confirm]).toEqual([[[W1]], { ...QUIET, about: W1, busy: true }]);
    });

    it('each one that succeeds is done, about what was asked, and the day is read again', () => {
      const close = screenOf();
      close.shown();
      close.screen.close();
      close.results.setOverride.next({ status: 'success', override: { date: MONDAY, windows: [], updatedAt: STAMPS.updatedAt } });
      expect([close.last().confirm, close.loads().length]).toEqual([{ ...QUIET, about: 'close', done: true }, 2]);
      close.results.calendar.next(answer(MONDAY, [], true));
      expect([close.last().day!.which, close.last().offers]).toEqual([NOT_AVAILABLE, { change: true, back: true }]);

      const back = screenOf();
      back.shown([], true);
      back.screen.back();
      back.results.deleteOverride.next({ status: 'success', date: MONDAY });
      expect([back.last().confirm, back.loads().length]).toEqual([{ ...QUIET, about: 'back', done: true }, 2]);

      const remove = screenOf();
      remove.shown([EXTRA]);
      remove.screen.removeWindow(W1);
      remove.results.deleteWindow.next({ status: 'success', windowId: W1 });
      expect([remove.last().confirm, remove.loads().length]).toEqual([{ ...QUIET, about: W1, done: true }, 2]);
    });

    it('each one refused with availability_conflict carries the appointments in the way, and the day is read again', () => {
      const SENTENCE = 'This would leave booked appointments outside the hours open for booking. Cancel or move them in the week first.';
      const refused = { ...failure('availability_conflict'), conflicts: CONFLICTS };
      const close = screenOf();
      close.shown();
      close.screen.close();
      close.results.setOverride.next(refused);
      expect([close.last().confirm, close.loads().length]).toEqual([{ ...QUIET, about: 'close', failure: SENTENCE, conflicts: IN_THE_WAY }, 2]);

      const back = screenOf();
      back.shown([], true);
      back.screen.back();
      back.results.deleteOverride.next(refused);
      expect(back.last().confirm).toEqual({ ...QUIET, about: 'back', failure: SENTENCE, conflicts: IN_THE_WAY });

      const remove = screenOf();
      remove.shown([EXTRA]);
      remove.screen.removeWindow(W1);
      remove.results.deleteWindow.next(refused);
      expect([remove.last().confirm, remove.loads().length]).toEqual([{ ...QUIET, about: W1, failure: SENTENCE, conflicts: IN_THE_WAY }, 2]);
    });

    it('a failure with a server\'s code and with a transport reason: in plain words, and the same action works again', () => {
      const { screen, rules, results, last, shown } = screenOf();
      shown([EXTRA], true);
      screen.close();
      results.setOverride.next(failure('concurrent_update'));
      expect(last().confirm).toEqual({ ...QUIET, about: 'close', failure: 'The calendar was being changed at the same moment. Please try again.' });
      screen.close();
      expect(rules.setOverride.mock.calls.length).toBe(2);
      results.setOverride.next(failure('network'));
      screen.removeWindow(W1);
      results.deleteWindow.next(failure('window_not_found'));
      expect(last().confirm).toEqual({ ...QUIET, about: W1, failure: 'This extra window no longer exists.' });
      screen.back();
      results.deleteOverride.next(failure('override_not_found'));
      expect(last().confirm).toEqual({ ...QUIET, about: 'back', failure: 'This day no longer has windows of its own: the weekly patterns apply.' });
    });

    it('the way back refused for an overlap says which hours overlap what, not to choose other hours', () => {
      const { screen, results, last, shown } = screenOf();
      shown([EXTRA], true);
      screen.back();
      results.deleteOverride.next(failure('availability_overlap'));
      expect(last().confirm.failure).toBe('The hours the weekly patterns give this day overlap one of its extra windows. Delete that extra window first.');
    });

    it('while one of them is under way another is not taken, whatever it is', () => {
      const { screen, shown, last, writes } = screenOf();
      shown([EXTRA], true);
      screen.removeWindow(W1);
      screen.removeWindow(W1);
      screen.close();
      screen.back();
      expect([writes(), last().confirm.about]).toEqual([[0, 0, 0, 1], W1]);
    });

    it('none is taken while no date is on show', () => {
      const { screen, last, writes } = screenOf();
      screen.start();
      screen.close();
      screen.back();
      screen.removeWindow(W1);
      expect([writes(), last().confirm]).toEqual([[0, 0, 0, 0], QUIET]);
    });

    it('"not available" and the way back are not taken while a draft is open; an extra window can be deleted', () => {
      const { screen, editing, writes } = screenOf();
      editing();
      screen.close();
      screen.back();
      expect(writes()).toEqual([0, 0, 0, 0]);
      screen.removeWindow(W1);
      expect(writes()).toEqual([0, 0, 0, 1]);
    });

    it('"not available" under way: a draft started meanwhile cannot be saved over it, and the answer is the dialog\'s, not the draft\'s', () => {
      const { screen, rules, results, last, shown } = screenOf();
      shown();
      screen.close();
      screen.edit();
      screen.save();
      expect(rules.setOverride.mock.calls.length).toBe(1);
      results.setOverride.next(failure('network'));
      expect([last().confirm.failure, last().save, last().draft === null]).toEqual([UNREACHABLE, QUIET, false]);
      screen.save();
      expect(rules.setOverride.mock.calls.length).toBe(2);
    });

    it('a save under way: "not available" is not taken, and the answer is the draft\'s, not the dialog\'s', () => {
      const { screen, rules, results, last, editing } = screenOf();
      editing();
      screen.save();
      results.setOverride.next(failure('network'));
      expect([last().save.failure, last().confirm, rules.setOverride.mock.calls.length]).toEqual([UNREACHABLE, QUIET, 1]);
    });

    it('a result of a write nobody here asked for only reads the day again', () => {
      const { results, last, shown, loads } = screenOf();
      shown();
      const before = { confirm: last().confirm, save: last().save, window: last().window };
      results.setOverride.next(failure('network'));
      results.deleteOverride.next(failure('network'));
      results.deleteWindow.next(failure('network'));
      results.createWindow.next(failure('network'));
      expect([last().confirm, last().save, last().window, loads().length]).toEqual([before.confirm, before.save, before.window, 5]);
    });
  });

  describe('the date on show is read again', () => {
    it('at every result of a write to a pattern or to a type, a failure included', () => {
      const { results, shown, loads } = screenOf();
      shown();
      results.createPattern.next(failure('network'));
      results.updatePattern.next(failure('availability_conflict'));
      results.deletePattern.next({ status: 'success', patternId: P1 });
      results.createType.next(failure('type_name_exists'));
      results.renameType.next(failure('network'));
      results.removeType.next({ status: 'success', typeId: STUDIO });
      expect(loads()).toEqual(Array.from({ length: 7 }, () => [MONDAY, MONDAY]));
    });

    it('a pattern changed while a date is on show: the day\'s two descriptions follow, the first from what is known, the second from the read', () => {
      const { results, known$, last, shown, loads } = screenOf();
      shown();
      results.updatePattern.next({ status: 'success', pattern: pattern({ start: '08:00', end: '12:00' }) });
      expect([last().loading, loads().length]).toEqual([true, 2]);
      known$.next({ ...KNOWN, patterns: [pattern({ start: '08:00', end: '12:00' })] });
      results.calendar.next(answer(MONDAY, [seen(MONDAY, '08:00', '12:00', STUDIO, 'Studio', 'pattern', P1), EXTRA]));
      expect([last().day!.patterns, last().day!.extras.length, last().loading]).toEqual([[{ time: '08:00 – 12:00', typeName: 'Studio' }], 1, false]);
    });

    it('every time the page becomes visible', () => {
      const { visible$, last, shown, loads } = screenOf();
      shown();
      visible$.next();
      visible$.next();
      expect([loads().length, last().loading]).toEqual([3, true]);
    });

    it('not while no date is on show: a write of the other parts and the page shown again read nothing', () => {
      const { screen, results, visible$, loads } = screenOf();
      screen.start();
      results.createPattern.next(failure('network'));
      visible$.next();
      screen.retry();
      expect(loads()).toEqual([]);
    });
  });

  describe('results that were already there at start()', () => {
    it('none is heard: no read, no day, no outcome', () => {
      const { screen, results, last, loads } = screenOf();
      results.calendar.next(answer(MONDAY, [PATTERN_WINDOW()]));
      results.setOverride.next(failure('network'));
      results.deleteOverride.next(failure('network'));
      results.createWindow.next(failure('network'));
      results.deleteWindow.next(failure('network'));
      results.updatePattern.next(failure('network'));
      results.renameType.next(failure('network'));
      screen.start();
      expect([last(), loads()]).toEqual([{ ...START, field: { date: TODAY }, choices: last().choices }, []]);
    });

    it('an answer to a load of an earlier visit that arrives after this start, with nothing on show, shows nothing', () => {
      const { screen, results, last } = screenOf();
      screen.start();
      results.calendar.next(answer(MONDAY, [PATTERN_WINDOW()]));
      expect([last().day, last().unread]).toEqual([null, null]);
    });
  });

  describe('the end of the subscription', () => {
    it('nothing is read afterwards, and the stream says nothing is shown: no day, no draft, no outcome', () => {
      const { screen, results, known$, visible$, last, editing, loads } = screenOf();
      const started = editing();
      screen.show(TUESDAY);
      started.unsubscribe();
      expect([last(), known$.observed, visible$.observed]).toEqual([START, false, false]);
      results.updatePattern.next(failure('network'));
      results.calendar.next(answer(MONDAY, [PATTERN_WINDOW()]));
      visible$.next();
      screen.show(MONDAY);
      screen.retry();
      expect([last(), loads().length]).toEqual([START, 1]);
    });

    it('started again, nothing of the date before: no day, no draft, the field on today, and a write left under way answers nobody', () => {
      const { screen, results, last, editing, draft, loads } = screenOf();
      const started = editing();
      screen.save();
      started.unsubscribe();
      screen.start();
      expect([last().day, draft(), last().field, last().refusal, loads().length]).toEqual([null, null, { date: TODAY }, null, 1]);
      // The answer of the save left under way reads nothing: no date is on show.
      results.setOverride.next(failure('network'));
      expect([last().save, loads().length]).toEqual([QUIET, 1]);
      // And a new draft can be saved.
      screen.show(MONDAY);
      results.calendar.next(answer(MONDAY, [PATTERN_WINDOW()]));
      screen.edit();
      screen.save();
      expect(last().save).toEqual({ ...QUIET, busy: true });
    });
  });
});
