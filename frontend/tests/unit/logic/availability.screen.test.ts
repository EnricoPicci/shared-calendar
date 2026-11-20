import type { AppointmentConflict, AvailabilityType, CalendarSettings, WeeklyPattern } from '@shared-calendar/shared';
import { ReplaySubject, Subject } from 'rxjs';
import { NO_PATTERNS, NO_TYPE_YET, NO_TYPES, startingFields, TYPE_NAME_HINT, type PatternFields } from '../../../src/logic/availability.model';
import { AvailabilityScreen, type Ask, type AvailabilityRules, type AvailabilityState, type AvailabilityTypes } from '../../../src/logic/availability.screen';
import type { CreatePatternResult, DeletePatternResult, PatternsResult, UpdatePatternResult } from '../../../src/services/availability-rules.types';
import type { CreateTypeResult, RemoveTypeResult, RenameTypeResult, TypesResult } from '../../../src/services/availability-types.types';
import type { SettingsResult } from '../../../src/services/calendar-settings.types';
import { POOL, STUDIO } from './fixtures';
import { useFarBrowserZone } from './zone';

// Fake services: result streams that replay their last value, as the real ones do, and spies.
// No network, no DOM. "Now" is a fixed moment handed to the screen: Friday 20 November 2026,
// 23:30 in Rome, which is still Friday in UTC and already Saturday at noon in the browser's zone
// of these tests.

const NOW = new Date('2026-11-20T22:30:00.000Z');
const TODAY = '2026-11-20';
const UNREACHABLE = 'The server cannot be reached. Check the connection and try again.';
const QUIET: Ask<never> = { about: '', busy: false, refusals: {}, failure: null, conflicts: null, done: false };
const START: AvailabilityState = {
  loading: false,
  typesUnread: null,
  types: null,
  typesEmpty: null,
  patternsUnread: null,
  groups: null,
  patternsEmpty: null,
  choices: [],
  typeHint: '',
  typeField: { name: '' },
  patternFields: startingFields(null),
  typeCreate: QUIET,
  rename: QUIET,
  patternCreate: QUIET,
  change: QUIET,
};
const STAMPS = { createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' };
const type = (typeId: string, name: string): AvailabilityType => ({ typeId, name, ...STAMPS });
const STUDIO_TYPE = type(STUDIO, 'Studio');
const POOL_TYPE = type(POOL, 'Piscina');
const P1 = '01M6PATTERN000000000000001';
const P2 = '01M6PATTERN000000000000002';
const pattern = (patternId: string, over: Partial<WeeklyPattern> = {}): WeeklyPattern => ({ patternId, weekday: 1, start: '09:00', end: '13:00', typeId: STUDIO, validFrom: '2026-11-20', validUntil: null, ...STAMPS, ...over });
const MONDAY = pattern(P1);
const TUESDAY = pattern(P2, { weekday: 2, start: '15:00', end: '18:00', typeId: POOL });
const FIELDS: PatternFields = { weekday: '3', start: '09:00', end: '13:00', typeId: STUDIO, validFrom: '2026-11-20', validUntil: '' };
const BODY = { weekday: 3, start: '09:00', end: '13:00', typeId: STUDIO, validFrom: '2026-11-20', validUntil: null };
const CONFLICTS: AppointmentConflict[] = [{ appointmentId: 'appt-1', username: 'alice', start: '2026-11-23T08:00:00.000Z', end: '2026-11-23T09:00:00.000Z' }];
const IN_THE_WAY = { sentence: '1 appointment is in the way:', rows: [{ date: 'Mon 23 Nov', time: '09:00–10:00', username: 'alice' }] };
const settingsOf = (timeZone: string): CalendarSettings => ({ timeZone, cancellationNoticeHours: 24, minBookingNoticeHours: 0, bookingHorizonDays: 56, maxFutureAppointmentsPerUser: null, updatedAt: null, updatedBy: null });
const failure = <R extends string>(reason: R) => ({ status: 'failure' as const, reason, message: 'for a developer' });

function screenOf(now: Date = NOW) {
  const results = {
    settings: new ReplaySubject<SettingsResult>(1),
    types: new ReplaySubject<TypesResult>(1),
    create: new ReplaySubject<CreateTypeResult>(1),
    rename: new ReplaySubject<RenameTypeResult>(1),
    remove: new ReplaySubject<RemoveTypeResult>(1),
    patterns: new ReplaySubject<PatternsResult>(1),
    createPattern: new ReplaySubject<CreatePatternResult>(1),
    updatePattern: new ReplaySubject<UpdatePatternResult>(1),
    deletePattern: new ReplaySubject<DeletePatternResult>(1),
  };
  const visible$ = new Subject<void>();
  const settings = { load: vi.fn<() => void>(), settingsResult$: results.settings.asObservable() };
  const types = {
    load: vi.fn<AvailabilityTypes['load']>(),
    create: vi.fn<AvailabilityTypes['create']>(),
    rename: vi.fn<AvailabilityTypes['rename']>(),
    typesResult$: results.types.asObservable(),
    createResult$: results.create.asObservable(),
    renameResult$: results.rename.asObservable(),
    removeResult$: results.remove.asObservable(),
  };
  const rules = {
    loadPatterns: vi.fn<AvailabilityRules['loadPatterns']>(),
    createPattern: vi.fn<AvailabilityRules['createPattern']>(),
    updatePattern: vi.fn<AvailabilityRules['updatePattern']>(),
    patternsResult$: results.patterns.asObservable(),
    createPatternResult$: results.createPattern.asObservable(),
    updatePatternResult$: results.updatePattern.asObservable(),
    deletePatternResult$: results.deletePattern.asObservable(),
  };
  const screen = new AvailabilityScreen(settings, types, rules, () => now, visible$);
  const states: AvailabilityState[] = [];
  screen.availability$.subscribe((s) => states.push(s)); // the view subscribes first
  const zoned = (timeZone = 'Europe/Rome') => results.settings.next({ status: 'success', settings: settingsOf(timeZone) });
  const typed = (...list: AvailabilityType[]) => results.types.next({ status: 'success', types: list });
  const patterned = (...list: WeeklyPattern[]) => results.patterns.next({ status: 'success', patterns: list });
  // Started, with the three reads answered: Rome, the two types, the two patterns.
  const shown = (typeList: AvailabilityType[] = [POOL_TYPE, STUDIO_TYPE], patternList: WeeklyPattern[] = [MONDAY, TUESDAY]) => {
    const started = screen.start();
    zoned();
    typed(...typeList);
    patterned(...patternList);
    return started;
  };
  // How many times each read was asked for: [settings, types, patterns].
  const reads = () => [settings.load.mock.calls.length, types.load.mock.calls.length, rules.loadPatterns.mock.calls.length];
  const last = () => states.at(-1)!;
  const names = () => last().types?.map((row) => row.name) ?? null;
  const rows = () => last().groups?.map((group) => `${group.weekday}: ${group.rows.map((row) => `${row.time} ${row.typeName}${row.ended ? ' (ended)' : ''}`).join(', ')}`) ?? null;
  return { screen, results, visible$, settings, types, rules, states, zoned, typed, patterned, shown, reads, last, names, rows };
}

describe('AvailabilityScreen', () => {
  useFarBrowserZone();

  describe('before start()', () => {
    it('nothing is read, no stream is listened to, and the state is empty', () => {
      const { reads, results, visible$, states } = screenOf();
      expect(reads()).toEqual([0, 0, 0]);
      expect([...Object.values(results).map((subject) => subject.observed), visible$.observed]).toEqual(Array(10).fill(false));
      expect(states).toEqual([START]);
    });

    it('no write and no new try does anything', () => {
      const { screen, types, rules, reads, states } = screenOf();
      screen.createType('Studio');
      screen.createType('');
      screen.rename(STUDIO, 'Sala');
      screen.createPattern(FIELDS);
      screen.change(P1, FIELDS);
      screen.retryTypes();
      screen.retryPatterns();
      expect([types.create, types.rename, rules.createPattern, rules.updatePattern].map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0, 0]);
      expect(reads()).toEqual([0, 0, 0]);
      expect(states).toHaveLength(1);
    });

    it('conflicts() answers nothing: the calendar\'s time zone is not known', () => {
      expect(screenOf().screen.conflicts(CONFLICTS)).toBeNull();
    });
  });

  describe('the three reads', () => {
    it('start() reads the settings, the types and the patterns, once each, and says it is loading, with no list yet', () => {
      const { screen, reads, last } = screenOf();
      screen.start();
      expect(reads()).toEqual([1, 1, 1]);
      expect(last()).toEqual({ ...START, loading: true });
    });

    it('"loading" lasts until the last of the three is answered, in whatever order', () => {
      const { screen, zoned, typed, patterned, states } = screenOf();
      screen.start();
      patterned(MONDAY);
      typed(STUDIO_TYPE);
      expect(states.at(-1)!.loading).toBe(true);
      zoned();
      expect(states.at(-1)!.loading).toBe(false);
    });

    it('the types arrive: their rows in the server\'s order, the choices of the pattern forms, and no hint', () => {
      const { screen, typed, last } = screenOf();
      screen.start();
      typed(POOL_TYPE, STUDIO_TYPE);
      expect(last().types).toEqual([
        { typeId: POOL, name: 'Piscina', renameLabel: 'Rename Piscina', deleteLabel: 'Delete Piscina' },
        { typeId: STUDIO, name: 'Studio', renameLabel: 'Rename Studio', deleteLabel: 'Delete Studio' },
      ]);
      expect(last().choices).toEqual([{ value: POOL, label: 'Piscina' }, { value: STUDIO, label: 'Studio' }]);
      expect([last().typesEmpty, last().typeHint, last().typesUnread]).toEqual([null, '', null]);
    });

    it('no type: the sentence of an empty list, and the pattern form says that a type must be created first', () => {
      const { shown, last } = screenOf();
      shown([], []);
      expect([last().types, last().typesEmpty, last().typeHint, last().choices]).toEqual([[], NO_TYPES, NO_TYPE_YET, []]);
      expect([last().groups, last().patternsEmpty]).toEqual([[], NO_PATTERNS]);
    });

    it('the patterns are listed once both they and the time zone are known, with their types\' names joined', () => {
      const { screen, zoned, typed, patterned, rows, last } = screenOf();
      screen.start();
      patterned(TUESDAY, MONDAY);
      expect(last().groups).toBeNull();
      zoned();
      // The types are not there yet: a fixed word stands for their names.
      expect(rows()).toEqual(['Monday: 09:00 – 13:00 Unknown type', 'Tuesday: 15:00 – 18:00 Unknown type']);
      typed(POOL_TYPE, STUDIO_TYPE);
      expect(rows()).toEqual(['Monday: 09:00 – 13:00 Studio', 'Tuesday: 15:00 – 18:00 Piscina']);
      expect(last().patternsEmpty).toBeNull();
    });

    it('a pattern whose type the list of types does not hold shows the fixed word, beside one that has its name', () => {
      const { shown, rows } = screenOf();
      shown([STUDIO_TYPE]);
      expect(rows()).toEqual(['Monday: 09:00 – 13:00 Studio', 'Tuesday: 15:00 – 18:00 Unknown type']);
    });

    it('a failed read of the types: why, in plain words, in the place of their list; the patterns are listed all the same', () => {
      const { screen, results, zoned, patterned, last, rows } = screenOf();
      screen.start();
      zoned();
      patterned(MONDAY);
      results.types.next(failure('network'));
      expect([last().typesUnread, last().types, last().typesEmpty, last().typeHint]).toEqual([UNREACHABLE, null, null, '']);
      expect([last().patternsUnread, rows(), last().loading]).toEqual([null, ['Monday: 09:00 – 13:00 Unknown type'], false]);
      expect(JSON.stringify(last())).not.toContain('for a developer');
    });

    it('retryTypes() reads the types again, and only them; the failure stays meanwhile and goes when the list arrives', () => {
      const { shown, screen, results, typed, reads, last, names } = screenOf();
      shown();
      results.types.next(failure('internal_error'));
      screen.retryTypes();
      expect(reads()).toEqual([1, 2, 1]);
      expect([last().loading, last().typesUnread]).toEqual([true, 'Something went wrong on the server. Please try again in a moment.']);
      results.types.next(failure('forbidden'));
      expect(last().typesUnread).toBe('Your account is not allowed to do this.');
      screen.retryTypes();
      typed(STUDIO_TYPE);
      expect([last().typesUnread, names(), last().loading]).toEqual([null, ['Studio'], false]);
    });

    it('a failed read of the patterns: why, in the place of their list; the types are listed all the same; retryPatterns() reads the patterns again, and only them', () => {
      const { screen, results, zoned, typed, patterned, reads, last, names, rows } = screenOf();
      screen.start();
      zoned();
      typed(STUDIO_TYPE);
      results.patterns.next(failure('network'));
      expect([last().patternsUnread, last().groups, last().patternsEmpty, names()]).toEqual([UNREACHABLE, null, null, ['Studio']]);
      screen.retryPatterns();
      expect(reads()).toEqual([1, 1, 2]);
      expect(last().patternsUnread).toBe(UNREACHABLE);
      patterned(MONDAY);
      expect([last().patternsUnread, rows()]).toEqual([null, ['Monday: 09:00 – 13:00 Studio']]);
    });

    it('a failed read of the settings: no list of patterns, and why in its place; retryPatterns() reads the settings and the patterns again', () => {
      const { screen, results, zoned, typed, patterned, reads, last, rows, names } = screenOf();
      screen.start();
      typed(STUDIO_TYPE);
      patterned(MONDAY);
      results.settings.next(failure('server'));
      expect([last().patternsUnread, last().groups, last().loading]).toEqual(['The server is not answering as it should. Please try again in a moment.', null, false]);
      expect(names()).toEqual(['Studio']);
      screen.retryPatterns();
      expect(reads()).toEqual([2, 1, 2]);
      zoned();
      patterned(MONDAY);
      expect([last().patternsUnread, rows()]).toEqual([null, ['Monday: 09:00 – 13:00 Studio']]);
    });

    it('with both the settings and the patterns unread, the patterns\' own failure is the one said', () => {
      const { screen, results, last } = screenOf();
      screen.start();
      results.settings.next(failure('server'));
      results.patterns.next(failure('network'));
      expect(last().patternsUnread).toBe(UNREACHABLE);
    });

    it('a list that could not be read again is taken off the screen; the types as last read stay as the choices and as the names of the patterns\' rows', () => {
      const { shown, results, visible$, last, rows } = screenOf();
      shown();
      visible$.next();
      results.types.next(failure('network'));
      results.patterns.next({ status: 'success', patterns: [MONDAY, TUESDAY] });
      expect([last().types, last().typesUnread]).toEqual([null, UNREACHABLE]);
      expect(last().choices.map((choice) => choice.label)).toEqual(['Piscina', 'Studio']);
      expect(rows()).toEqual(['Monday: 09:00 – 13:00 Studio', 'Tuesday: 15:00 – 18:00 Piscina']);
      visible$.next();
      results.patterns.next(failure('network'));
      expect([last().groups, last().patternsUnread]).toEqual([null, UNREACHABLE]);
    });

    it('results that were already there before start() are not this start\'s: the reads are made and waited for', () => {
      const { screen, zoned, typed, patterned, reads, last } = screenOf();
      zoned('Asia/Tokyo');
      typed(STUDIO_TYPE);
      patterned(MONDAY);
      screen.start();
      expect(reads()).toEqual([1, 1, 1]);
      expect(last()).toEqual({ ...START, loading: true });
    });

    it('the same types and patterns read again keep the same objects; others are other objects', () => {
      const { shown, visible$, typed, patterned, last } = screenOf();
      shown();
      const { types, groups, choices } = last();
      visible$.next();
      typed({ ...POOL_TYPE }, { ...STUDIO_TYPE });
      patterned({ ...MONDAY }, { ...TUESDAY });
      expect(last().types).toBe(types);
      expect(last().groups).toBe(groups);
      expect(last().choices).toBe(choices);
      visible$.next();
      typed(STUDIO_TYPE);
      patterned(MONDAY);
      expect(last().types).not.toBe(types);
      expect(last().groups).not.toBe(groups);
      expect(last().choices).not.toBe(choices);
    });
  });

  describe('"today", in the calendar\'s time zone', () => {
    // 22:30 UTC on Friday 20 November: Friday in Rome, Saturday in Tokyo, Friday in New York,
    // and Saturday in the browser's zone of these tests.
    const untilFriday = pattern(P1, { validFrom: '2026-01-01', validUntil: '2026-11-20' });

    it('the form that creates a pattern starts on today\'s date in that zone, once the settings say which it is', () => {
      const { screen, zoned, last } = screenOf();
      screen.start();
      const before = last().patternFields;
      expect(before).toEqual(startingFields(null));
      zoned('Europe/Rome');
      expect(last().patternFields).toEqual(startingFields(TODAY));
      expect(last().patternFields).not.toBe(before);
    });

    it('in Tokyo it is already tomorrow: the form starts there, and a pattern that ended on Friday has ended', () => {
      const { screen, zoned, typed, patterned, last, rows } = screenOf();
      screen.start();
      zoned('Asia/Tokyo');
      typed(STUDIO_TYPE);
      patterned(untilFriday);
      expect(last().patternFields.validFrom).toBe('2026-11-21');
      expect(rows()).toEqual(['Monday: 09:00 – 13:00 Studio (ended)']);
    });

    it('in Rome and in New York it is still Friday: the same pattern has not ended', () => {
      for (const zone of ['Europe/Rome', 'America/New_York']) {
        const { screen, zoned, typed, patterned, last, rows } = screenOf();
        screen.start();
        zoned(zone);
        typed(STUDIO_TYPE);
        patterned(untilFriday);
        expect(last().patternFields.validFrom, zone).toBe('2026-11-20');
        expect(rows(), zone).toEqual(['Monday: 09:00 – 13:00 Studio']);
      }
    });

    it('a pattern that ended yesterday has ended, and stays in the list', () => {
      const { shown, rows } = screenOf();
      shown([STUDIO_TYPE], [pattern(P1, { validFrom: '2026-01-01', validUntil: '2026-11-19' })]);
      expect(rows()).toEqual(['Monday: 09:00 – 13:00 Studio (ended)']);
    });

    it('the settings read again after their first answer leave the form as it is', () => {
      const { screen, results, zoned, last } = screenOf();
      screen.start();
      results.settings.next(failure('network'));
      const empty = last().patternFields;
      expect(empty.validFrom).toBe('');
      screen.retryPatterns();
      zoned();
      const filled = last().patternFields;
      expect(filled).toEqual(startingFields(TODAY));
      // Once the zone is known the settings are not asked for again.
      screen.retryPatterns();
      expect(last().patternFields).toBe(filled);
    });
  });

  describe('"Create type"', () => {
    it('a name: it goes to the service, once, and the screen says a create is under way; nothing is read yet', () => {
      const { shown, screen, types, reads, last } = screenOf();
      shown();
      screen.createType('Sala');
      expect(types.create.mock.calls).toEqual([['Sala']]);
      expect(last().typeCreate).toEqual({ ...QUIET, busy: true });
      expect(reads()).toEqual([1, 1, 1]);
    });

    it('spaces around the name are removed before it is sent', () => {
      const { shown, screen, types } = screenOf();
      shown();
      screen.createType('  Sala grande ');
      expect(types.create).toHaveBeenCalledWith('Sala grande');
    });

    it.each([[''], ['   '], ['a'.repeat(41)], ['Sala\tgrande']])('"%s" is refused by the check: its sentence, no call, no read, and the lists kept', (text) => {
      const { shown, screen, types, reads, last } = screenOf();
      shown();
      const { types: listed, groups, typeField } = last();
      screen.createType(text);
      expect(types.create).not.toHaveBeenCalled();
      expect(last().typeCreate).toEqual({ ...QUIET, refusals: { name: TYPE_NAME_HINT } });
      expect(reads()).toEqual([1, 1, 1]);
      expect([last().types, last().groups, last().typeField]).toEqual([listed, groups, typeField]);
      expect(last().typeField).toBe(typeField);
    });

    it('"studio" passes the check: the server is the one to say that the name exists, and the field is not in fault', () => {
      const { shown, screen, results, types, last } = screenOf();
      shown();
      const field = last().typeField;
      screen.createType('studio');
      expect(types.create).toHaveBeenCalledWith('studio');
      results.create.next(failure('type_name_exists'));
      expect(last().typeCreate).toEqual({ ...QUIET, failure: 'A type with this name exists already. Choose another name.' });
      // What was typed stays: the field is not to be filled again.
      expect(last().typeField).toBe(field);
    });

    it('a create that succeeds: done, the field to empty, and the types read again, not the patterns', () => {
      const { shown, screen, results, typed, reads, last, names } = screenOf();
      shown();
      const field = last().typeField;
      screen.createType('Sala');
      results.create.next({ status: 'success', type: type('01M6SALA000000000000000000', 'Sala') });
      expect(last().typeCreate).toEqual({ ...QUIET, done: true });
      expect(last().typeField).toEqual({ name: '' });
      expect(last().typeField).not.toBe(field);
      expect(reads()).toEqual([1, 2, 1]);
      expect(last().loading).toBe(true);
      typed(POOL_TYPE, type('01M6SALA000000000000000000', 'Sala'), STUDIO_TYPE);
      expect(names()).toEqual(['Piscina', 'Sala', 'Studio']);
      expect(last().choices.map((choice) => choice.label)).toEqual(['Piscina', 'Sala', 'Studio']);
    });

    it('the limit met says how many types the calendar holds', () => {
      const { shown, screen, results, last } = screenOf();
      shown();
      screen.createType('Sala');
      results.create.next(failure('limit_reached'));
      expect(last().typeCreate.failure).toBe('The calendar can hold 20 types at most. Delete one to create another.');
    });

    it('a create that cannot reach the server: why, the types read again all the same, and what was typed kept', () => {
      const { shown, screen, results, reads, last } = screenOf();
      shown();
      const field = last().typeField;
      screen.createType('Sala');
      results.create.next(failure('network'));
      expect(last().typeCreate).toEqual({ ...QUIET, failure: UNREACHABLE });
      expect(last().typeField).toBe(field);
      expect(reads()).toEqual([1, 2, 1]);
      expect(JSON.stringify(last())).not.toContain('for a developer');
    });

    it('a refusal takes an earlier failure away, and the next create that is sent takes the refusal away', () => {
      const { shown, screen, results, last } = screenOf();
      shown();
      screen.createType('Sala');
      results.create.next(failure('network'));
      screen.createType('');
      expect(last().typeCreate).toEqual({ ...QUIET, refusals: { name: TYPE_NAME_HINT } });
      screen.createType('Sala');
      expect(last().typeCreate).toEqual({ ...QUIET, busy: true });
    });

    it('a second create while one is under way is not taken, sent or refused', () => {
      const { shown, screen, types, last } = screenOf();
      shown();
      screen.createType('Sala');
      screen.createType('Altra');
      screen.createType('');
      expect(types.create.mock.calls).toEqual([['Sala']]);
      expect(last().typeCreate).toEqual({ ...QUIET, busy: true });
    });
  });

  describe('"Rename"', () => {
    it('a name: it goes to the service with the type\'s id, and the outcome says which type it is about', () => {
      const { shown, screen, types, last } = screenOf();
      shown();
      screen.rename(STUDIO, ' Sala ');
      expect(types.rename.mock.calls).toEqual([[STUDIO, 'Sala']]);
      expect(last().rename).toEqual({ ...QUIET, about: STUDIO, busy: true });
    });

    it('a rename to the same name is sent as it is', () => {
      const { shown, screen, types } = screenOf();
      shown();
      screen.rename(STUDIO, 'Studio');
      expect(types.rename).toHaveBeenCalledWith(STUDIO, 'Studio');
    });

    it('a text that is not a name is refused: its sentence, about that type, no call and no read', () => {
      const { shown, screen, types, reads, last } = screenOf();
      shown();
      screen.rename(POOL, '  ');
      expect(types.rename).not.toHaveBeenCalled();
      expect(last().rename).toEqual({ ...QUIET, about: POOL, refusals: { name: TYPE_NAME_HINT } });
      expect(reads()).toEqual([1, 1, 1]);
      // The form that creates a type says nothing of it.
      expect(last().typeCreate).toEqual(QUIET);
    });

    it('a rename that succeeds: done, the types read again, and the patterns\' rows say the new name with no read of the patterns', () => {
      const { shown, screen, results, typed, reads, last, rows, names } = screenOf();
      shown();
      const { groups, typeField } = last();
      screen.rename(STUDIO, 'Sala');
      results.rename.next({ status: 'success', type: type(STUDIO, 'Sala') });
      expect(last().rename).toEqual({ ...QUIET, about: STUDIO, done: true });
      expect(reads()).toEqual([1, 2, 1]);
      // Until the types arrive the rows say the old name.
      expect(last().groups).toBe(groups);
      typed(POOL_TYPE, type(STUDIO, 'Sala'));
      expect(names()).toEqual(['Piscina', 'Sala']);
      expect(rows()).toEqual(['Monday: 09:00 – 13:00 Sala', 'Tuesday: 15:00 – 18:00 Piscina']);
      expect(last().groups![0]!.rows[0]!.changeLabel).toBe('Change Monday 09:00 – 13:00 Sala');
      expect(reads()).toEqual([1, 2, 1]);
      // The form that creates a type is not emptied by a rename.
      expect(last().typeField).toBe(typeField);
    });

    it.each([
      ['type_name_exists', 'A type with this name exists already. Choose another name.'],
      ['type_not_found', 'This type no longer exists.'],
      ['concurrent_update', 'The calendar was being changed at the same moment. Please try again.'],
      ['network', UNREACHABLE],
    ] as const)('a rename that fails with %s: why, about that type, and the types read again all the same', (reason, sentence) => {
      const { shown, screen, results, reads, last } = screenOf();
      shown();
      screen.rename(STUDIO, 'Piscina');
      results.rename.next(failure(reason));
      expect(last().rename).toEqual({ ...QUIET, about: STUDIO, failure: sentence });
      expect(reads()).toEqual([1, 2, 1]);
    });

    it('a second rename while one is under way is not taken, also for another type: the answer that arrives is about the first', () => {
      const { shown, screen, results, types, last } = screenOf();
      shown();
      screen.rename(STUDIO, 'Sala');
      screen.rename(POOL, 'Vasca');
      screen.rename(POOL, '');
      expect(types.rename.mock.calls).toEqual([[STUDIO, 'Sala']]);
      results.rename.next(failure('network'));
      expect(last().rename).toEqual({ ...QUIET, about: STUDIO, failure: UNREACHABLE });
      // Answered, the next one goes.
      screen.rename(POOL, 'Vasca');
      expect(types.rename.mock.calls).toEqual([[STUDIO, 'Sala'], [POOL, 'Vasca']]);
      expect(last().rename).toEqual({ ...QUIET, about: POOL, busy: true });
    });
  });

  describe('"Create pattern"', () => {
    it('six good fields: the body goes to the service, once, and the screen says a create is under way', () => {
      const { shown, screen, rules, reads, last } = screenOf();
      shown();
      screen.createPattern(FIELDS);
      expect(rules.createPattern.mock.calls).toEqual([[BODY]]);
      expect(last().patternCreate).toEqual({ ...QUIET, busy: true });
      expect(reads()).toEqual([1, 1, 1]);
    });

    it('fields in fault: every one said, no call, no read, the lists and the form kept', () => {
      const { shown, screen, rules, reads, last } = screenOf();
      shown();
      const { groups, patternFields } = last();
      screen.createPattern({ ...FIELDS, end: '09:00', typeId: '', validFrom: '', validUntil: 'x' });
      expect(rules.createPattern).not.toHaveBeenCalled();
      expect(last().patternCreate).toEqual({
        ...QUIET,
        refusals: { end: 'End must be later than Start.', typeId: 'Type must be chosen.', validFrom: 'Valid from must be a date.', validUntil: 'Valid until must be a date, or left empty.' },
      });
      expect(reads()).toEqual([1, 1, 1]);
      expect(last().groups).toBe(groups);
      expect(last().patternFields).toBe(patternFields);
    });

    it('while no type exists every create is refused: no type can be chosen', () => {
      const { shown, screen, rules, last } = screenOf();
      shown([], []);
      screen.createPattern({ ...FIELDS, typeId: '' });
      expect(rules.createPattern).not.toHaveBeenCalled();
      expect([last().typeHint, last().patternCreate.refusals]).toEqual([NO_TYPE_YET, { typeId: 'Type must be chosen.' }]);
    });

    it('a create that succeeds: done, the form back to its starting values, and the patterns read again, not the types', () => {
      const { shown, screen, results, patterned, reads, last, rows } = screenOf();
      shown();
      const before = last().patternFields;
      screen.createPattern(FIELDS);
      const created = pattern('01M6PATTERN000000000000003', { weekday: 3 });
      results.createPattern.next({ status: 'success', pattern: created });
      expect(last().patternCreate).toEqual({ ...QUIET, done: true });
      expect(last().patternFields).toEqual(startingFields(TODAY));
      expect(last().patternFields).not.toBe(before);
      expect(reads()).toEqual([1, 1, 2]);
      patterned(MONDAY, TUESDAY, created);
      expect(rows()).toEqual(['Monday: 09:00 – 13:00 Studio', 'Tuesday: 15:00 – 18:00 Piscina', 'Wednesday: 09:00 – 13:00 Studio']);
    });

    it.each([
      ['availability_overlap', 'Another window of the same day covers part of these hours, whatever its type. Choose other hours.'],
      ['limit_reached', 'The calendar can hold 50 weekly patterns at most. Delete one to create another.'],
      ['concurrent_update', 'The calendar was being changed at the same moment. Please try again.'],
      ['server', 'The server is not answering as it should. Please try again in a moment.'],
    ] as const)('a create that fails with %s: why, the patterns read again all the same, and what was chosen kept', (reason, sentence) => {
      const { shown, screen, results, reads, last } = screenOf();
      shown();
      const before = last().patternFields;
      screen.createPattern(FIELDS);
      results.createPattern.next(failure(reason));
      expect(last().patternCreate).toEqual({ ...QUIET, failure: sentence });
      expect(last().patternFields).toBe(before);
      expect(reads()).toEqual([1, 1, 2]);
    });

    it('type_not_found means the list of types on show is old: the types are read again too', () => {
      const { shown, screen, results, reads, last } = screenOf();
      shown();
      screen.createPattern(FIELDS);
      results.createPattern.next(failure('type_not_found'));
      expect(last().patternCreate.failure).toBe('This type no longer exists.');
      expect(reads()).toEqual([1, 2, 2]);
    });

    it('availability_conflict: its sentence, and the appointments in the way in the calendar\'s time zone', () => {
      const { shown, screen, results, last } = screenOf();
      shown();
      screen.createPattern(FIELDS);
      results.createPattern.next({ ...failure('availability_conflict'), conflicts: CONFLICTS });
      expect(last().patternCreate).toEqual({ ...QUIET, failure: 'This would leave booked appointments outside the hours open for booking. Cancel or move them in the week first.', conflicts: IN_THE_WAY });
      // No id of an appointment is carried further than the service.
      expect(JSON.stringify(last())).not.toContain('appt-1');
    });

    it('availability_conflict with no list, or an empty one: the sentence alone', () => {
      const { shown, screen, results, last } = screenOf();
      shown();
      screen.createPattern(FIELDS);
      results.createPattern.next(failure('availability_conflict'));
      expect([last().patternCreate.failure, last().patternCreate.conflicts]).toEqual([expect.stringMatching(/^This would leave booked appointments/), null]);
      screen.createPattern(FIELDS);
      results.createPattern.next({ ...failure('availability_conflict'), conflicts: [] });
      expect(last().patternCreate.conflicts).toBeNull();
    });

    it('the appointments in the way go at the next create, sent or refused', () => {
      const { shown, screen, results, last } = screenOf();
      shown();
      screen.createPattern(FIELDS);
      results.createPattern.next({ ...failure('availability_conflict'), conflicts: CONFLICTS });
      screen.createPattern({ ...FIELDS, typeId: '' });
      expect([last().patternCreate.conflicts, last().patternCreate.failure]).toEqual([null, null]);
      results.createPattern.next({ ...failure('availability_conflict'), conflicts: CONFLICTS });
      screen.createPattern(FIELDS);
      expect(last().patternCreate).toEqual({ ...QUIET, busy: true });
    });

    it('a second create while one is under way is not taken', () => {
      const { shown, screen, rules, last } = screenOf();
      shown();
      screen.createPattern(FIELDS);
      screen.createPattern({ ...FIELDS, weekday: '4' });
      screen.createPattern({ ...FIELDS, typeId: '' });
      expect(rules.createPattern.mock.calls).toEqual([[BODY]]);
      expect(last().patternCreate).toEqual({ ...QUIET, busy: true });
    });
  });

  describe('"Change"', () => {
    it('six good fields: one call that replaces the pattern\'s fields, about that pattern', () => {
      const { shown, screen, rules, last } = screenOf();
      shown();
      screen.change(P1, { ...FIELDS, validUntil: '2026-12-31' });
      expect(rules.updatePattern.mock.calls).toEqual([[P1, { ...BODY, validUntil: '2026-12-31' }]]);
      expect(rules.createPattern).not.toHaveBeenCalled();
      expect(last().change).toEqual({ ...QUIET, about: P1, busy: true });
    });

    it('fields in fault: said about that pattern, no call, no read; the form that creates says nothing of it', () => {
      const { shown, screen, rules, reads, last } = screenOf();
      shown();
      screen.change(P2, { ...FIELDS, end: '08:00', validUntil: '2026-01-01' });
      expect(rules.updatePattern).not.toHaveBeenCalled();
      expect(last().change).toEqual({ ...QUIET, about: P2, refusals: { end: 'End must be later than Start.', validUntil: 'Valid until must not be before Valid from.' } });
      expect(last().patternCreate).toEqual(QUIET);
      expect(reads()).toEqual([1, 1, 1]);
    });

    it('a change that succeeds: done, the patterns read again, and the form that creates is left as it is', () => {
      const { shown, screen, results, patterned, reads, last, rows } = screenOf();
      shown();
      const form = last().patternFields;
      screen.change(P1, { ...FIELDS, weekday: '1', end: '14:00' });
      results.updatePattern.next({ status: 'success', pattern: pattern(P1, { end: '14:00' }) });
      expect(last().change).toEqual({ ...QUIET, about: P1, done: true });
      expect(last().patternFields).toBe(form);
      expect(reads()).toEqual([1, 1, 2]);
      patterned(pattern(P1, { end: '14:00' }), TUESDAY);
      expect(rows()).toEqual(['Monday: 09:00 – 14:00 Studio', 'Tuesday: 15:00 – 18:00 Piscina']);
    });

    it.each([
      ['pattern_not_found', 'This pattern no longer exists.'],
      ['availability_overlap', 'Another window of the same day covers part of these hours, whatever its type. Choose other hours.'],
      ['concurrent_update', 'The calendar was being changed at the same moment. Please try again.'],
      ['network', UNREACHABLE],
    ] as const)('a change that fails with %s: why, about that pattern, and the patterns read again all the same', (reason, sentence) => {
      const { shown, screen, results, reads, last } = screenOf();
      shown();
      screen.change(P1, FIELDS);
      results.updatePattern.next(failure(reason));
      expect(last().change).toEqual({ ...QUIET, about: P1, failure: sentence });
      expect(reads()).toEqual([1, 1, 2]);
    });

    it('type_not_found reads the types again too; availability_conflict carries the appointments in the way', () => {
      const { shown, screen, results, reads, last } = screenOf();
      shown();
      screen.change(P1, FIELDS);
      results.updatePattern.next(failure('type_not_found'));
      expect(reads()).toEqual([1, 2, 2]);
      screen.change(P1, FIELDS);
      results.updatePattern.next({ ...failure('availability_conflict'), conflicts: CONFLICTS });
      expect(last().change).toEqual({ ...QUIET, about: P1, failure: expect.stringMatching(/^This would leave booked appointments/), conflicts: IN_THE_WAY });
    });

    it('a second change while one is under way is not taken, also for another pattern', () => {
      const { shown, screen, results, rules, last } = screenOf();
      shown();
      screen.change(P1, FIELDS);
      screen.change(P2, FIELDS);
      screen.change(P2, { ...FIELDS, typeId: '' });
      expect(rules.updatePattern).toHaveBeenCalledTimes(1);
      results.updatePattern.next({ status: 'success', pattern: MONDAY });
      expect(last().change).toEqual({ ...QUIET, about: P1, done: true });
    });

    it('a change and a create of a pattern under way together do not get in each other\'s way', () => {
      const { shown, screen, results, rules, last } = screenOf();
      shown();
      screen.change(P1, FIELDS);
      screen.createPattern(FIELDS);
      expect([rules.updatePattern.mock.calls.length, rules.createPattern.mock.calls.length]).toEqual([1, 1]);
      results.createPattern.next(failure('availability_overlap'));
      expect(last().change).toEqual({ ...QUIET, about: P1, busy: true });
      results.updatePattern.next({ status: 'success', pattern: MONDAY });
      expect([last().change.done, last().patternCreate.failure]).toEqual([true, expect.stringMatching(/^Another window/)]);
    });
  });

  describe('the two deletes, which the view calls', () => {
    it('a type deleted: the types are read again, and the row goes with the list that arrives', () => {
      const { shown, results, typed, reads, names } = screenOf();
      shown();
      results.remove.next({ status: 'success', typeId: POOL });
      expect(reads()).toEqual([1, 2, 1]);
      expect(names()).toEqual(['Piscina', 'Studio']);
      typed(STUDIO_TYPE);
      expect(names()).toEqual(['Studio']);
    });

    it('a delete of a type that failed reads the types again all the same', () => {
      const { shown, results, reads } = screenOf();
      shown();
      results.remove.next(failure('type_in_use'));
      results.remove.next(failure('network'));
      expect(reads()).toEqual([1, 3, 1]);
    });

    it('a pattern deleted, or not: the patterns are read again, not the types', () => {
      const { shown, results, patterned, reads, rows } = screenOf();
      shown();
      results.deletePattern.next({ ...failure('availability_conflict'), conflicts: CONFLICTS });
      expect(reads()).toEqual([1, 1, 2]);
      results.deletePattern.next({ status: 'success', patternId: P2 });
      expect(reads()).toEqual([1, 1, 3]);
      patterned(MONDAY);
      expect(rows()).toEqual(['Monday: 09:00 – 13:00 Studio']);
    });

    it('conflicts() makes the appointments in the way of a failure ready to draw, in the calendar\'s zone; nothing when the failure names none', () => {
      const { shown, screen } = screenOf();
      shown();
      expect(screen.conflicts(CONFLICTS)).toEqual(IN_THE_WAY);
      expect(screen.conflicts(undefined)).toBeNull();
      expect(screen.conflicts([])).toBeNull();
    });

    it('conflicts() uses the zone the settings name, not the default one', () => {
      const { screen, zoned } = screenOf();
      screen.start();
      zoned('Asia/Tokyo');
      expect(screen.conflicts(CONFLICTS)!.rows).toEqual([{ date: 'Mon 23 Nov', time: '17:00–18:00', username: 'alice' }]);
    });

    it('results of writes that were already there before start() are not this start\'s: nothing is said and nothing more read for them', () => {
      const { screen, results, reads, last } = screenOf();
      results.create.next(failure('type_name_exists'));
      results.rename.next({ status: 'success', type: STUDIO_TYPE });
      results.remove.next(failure('type_in_use'));
      results.createPattern.next({ ...failure('availability_conflict'), conflicts: CONFLICTS });
      results.updatePattern.next(failure('type_not_found'));
      results.deletePattern.next({ status: 'success', patternId: P1 });
      screen.start();
      expect(reads()).toEqual([1, 1, 1]);
      expect(last()).toEqual({ ...START, loading: true });
    });
  });

  describe('the tab becoming visible', () => {
    it('both lists are read again, each time, not the settings; what the forms say stays', () => {
      const { shown, screen, visible$, reads, last } = screenOf();
      shown();
      screen.createType('');
      visible$.next();
      expect(reads()).toEqual([1, 2, 2]);
      expect(last().loading).toBe(true);
      expect(last().typeCreate.refusals).toEqual({ name: TYPE_NAME_HINT });
      visible$.next();
      expect(reads()).toEqual([1, 3, 3]);
    });

    it('while the time zone is not known the settings are read again too, unless their read is still under way', () => {
      const { screen, results, visible$, reads } = screenOf();
      screen.start();
      visible$.next();
      expect(reads()).toEqual([1, 2, 2]);
      results.settings.next(failure('network'));
      visible$.next();
      expect(reads()).toEqual([2, 3, 3]);
    });
  });

  describe('after the subscription of start() ends', () => {
    it('everything is forgotten, no stream is heard, and nothing is read or written', () => {
      const { shown, screen, results, visible$, types, rules, reads, last } = screenOf();
      const started = shown();
      screen.createType('');
      started.unsubscribe();
      expect(last()).toEqual(START);
      expect([...Object.values(results).map((subject) => subject.observed), visible$.observed]).toEqual(Array(10).fill(false));
      visible$.next();
      screen.createType('Sala');
      screen.rename(STUDIO, 'Sala');
      screen.createPattern(FIELDS);
      screen.change(P1, FIELDS);
      screen.retryTypes();
      screen.retryPatterns();
      expect(reads()).toEqual([1, 1, 1]);
      expect([types.create, types.rename, rules.createPattern, rules.updatePattern].map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0, 0]);
      expect(screen.conflicts(CONFLICTS)).toBeNull();
      expect(last()).toEqual(START);
    });

    it('started again, everything is read again, the settings included, and nothing of the first start is there meanwhile', () => {
      const { shown, screen, zoned, typed, patterned, reads, last, rows } = screenOf();
      shown().unsubscribe();
      screen.start();
      expect(reads()).toEqual([2, 2, 2]);
      expect(last()).toEqual({ ...START, loading: true });
      zoned();
      typed(STUDIO_TYPE);
      patterned(MONDAY);
      expect(rows()).toEqual(['Monday: 09:00 – 13:00 Studio']);
    });

    it('left while a write was under way, its late answer is not the next start\'s, and the next write goes', () => {
      const { shown, screen, results, types, reads, last } = screenOf();
      const started = shown();
      screen.createType('Sala');
      started.unsubscribe();
      results.create.next(failure('network'));
      screen.start();
      expect(reads()).toEqual([2, 2, 2]);
      expect(last().typeCreate).toEqual(QUIET);
      screen.createType('Altra');
      expect(types.create.mock.calls).toEqual([['Sala'], ['Altra']]);
    });
  });

  it('a late subscriber gets the current state at once', () => {
    const { shown, screen, last } = screenOf();
    shown();
    const late: AvailabilityState[] = [];
    screen.availability$.subscribe((s) => late.push(s));
    expect(late).toEqual([last()]);
  });
});
