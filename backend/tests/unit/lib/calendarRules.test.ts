import {
  checkAvailabilityWrite,
  checkTypeDelete,
  checkTypeName,
  typeNameKey,
  type AvailabilityWrite,
  type CalendarState,
  type NamedType,
  type StateAppointment,
  type TypeReferences,
} from '../../../src/lib/calendarRules';

// Pure rules: no clock, no AWS. "Today" and "now" are passed in (R-TIME-04).

const STUDIO = '01JC0000000000000000000001';
const POOL = '01JC0000000000000000000002';
const named = (typeId: string, name: string): NamedType => ({ typeId, nameKey: typeNameKey(name) });

describe('typeNameKey', () => {
  it('lower-cases without a locale', () => {
    expect(typeNameKey('Studio')).toBe('studio');
    expect(typeNameKey('STUDIO')).toBe('studio');
    expect(typeNameKey('Écoute')).toBe('écoute');
  });

  // Not full Unicode case folding: recorded here so that a change is a decision (step 44 report).
  it('keeps ß and SS apart, as toLowerCase does', () => {
    expect(typeNameKey('Straße')).not.toBe(typeNameKey('STRASSE'));
  });
});

describe('checkTypeName on create (R-TYPE-01)', () => {
  it('allows a new name', () => {
    expect(checkTypeName('Pool', [named(STUDIO, 'Studio')])).toBeNull();
  });

  it('allows the first type', () => {
    expect(checkTypeName('Studio', [])).toBeNull();
  });

  it.each(['studio', 'Studio', 'STUDIO', 'sTuDiO'])('refuses %s when Studio exists (AC-03)', (name) => {
    expect(checkTypeName(name, [named(STUDIO, 'Studio')])).toEqual({ error: 'type_name_exists' });
  });

  it('compares the stored nameKey', () => {
    expect(checkTypeName('Studio', [{ typeId: STUDIO, nameKey: 'studio' }])).toEqual({ error: 'type_name_exists' });
  });

  const types = (n: number) => Array.from({ length: n }, (_, i) => named(`01JC00000000000000000000${String(i).padStart(2, '0')}`, `Type ${i}`));

  it('allows the 20th type', () => {
    expect(checkTypeName('Twentieth', types(19))).toBeNull();
  });

  it('refuses the 21st type with limit_reached', () => {
    expect(checkTypeName('Twenty-first', types(20))).toEqual({ error: 'limit_reached' });
  });

  it('answers type_name_exists before limit_reached when both apply', () => {
    expect(checkTypeName('type 3', types(20))).toEqual({ error: 'type_name_exists' });
  });
});

describe('checkTypeName on rename (R-TYPE-02)', () => {
  const existing = [named(STUDIO, 'Studio'), named(POOL, 'Pool')];

  it('allows a new name', () => {
    expect(checkTypeName('Gym', existing, STUDIO)).toBeNull();
  });

  it.each(['Studio', 'studio', 'STUDIO'])('allows keeping its own name, also in another case (%s)', (name) => {
    expect(checkTypeName(name, existing, STUDIO)).toBeNull();
  });

  it.each(['Pool', 'pool'])('refuses the name of another type (%s)', (name) => {
    expect(checkTypeName(name, existing, STUDIO)).toEqual({ error: 'type_name_exists' });
  });

  it('is not limited by the count: a rename adds no type', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => named(`01JC00000000000000000000${String(i).padStart(2, '0')}`, `Type ${i}`));
    expect(checkTypeName('Renamed', twenty, twenty[0]!.typeId)).toBeNull();
  });
});

describe('checkTypeDelete (R-TYPE-03)', () => {
  // Europe/Rome, 2026-11-16: today and now as the handler computes them.
  const TODAY = '2026-11-16';
  const NOW = '2026-11-16T09:30:00.000Z';
  const none: TypeReferences = { patterns: [], overrides: [], oneOffs: [], appointments: [] };
  const refs = (more: Partial<TypeReferences>): TypeReferences => ({ ...none, ...more });
  const appt = (typeId: string, status: 'booked' | 'cancelled', end: string) => ({ typeId, status, end });

  it('allows deleting a type nothing refers to', () => {
    expect(checkTypeDelete(STUDIO, none, TODAY, NOW)).toBeNull();
  });

  describe('blocks the delete (AC-28)', () => {
    it.each<[string, TypeReferences]>([
      ['a weekly pattern', refs({ patterns: [{ typeId: STUDIO }] })],
      // Patterns block whatever their validity: the check never looks at validFrom/validUntil.
      ['a pattern among others', refs({ patterns: [{ typeId: POOL }, { typeId: STUDIO }] })],
      ['an override dated today', refs({ overrides: [{ date: TODAY, windows: [{ typeId: POOL }, { typeId: STUDIO }] }] })],
      ['a future override', refs({ overrides: [{ date: '2026-12-01', windows: [{ typeId: STUDIO }] }] })],
      ['a one-off window dated today', refs({ oneOffs: [{ date: TODAY, typeId: STUDIO }] })],
      ['a future one-off window', refs({ oneOffs: [{ date: '2026-11-17', typeId: STUDIO }] })],
      ['a booked appointment not yet started', refs({ appointments: [appt(STUDIO, 'booked', '2026-11-17T09:00:00.000Z')] })],
      ['a booked appointment in progress', refs({ appointments: [appt(STUDIO, 'booked', '2026-11-16T10:00:00.000Z')] })],
    ])('%s', (_, references) => {
      expect(checkTypeDelete(STUDIO, references, TODAY, NOW)).toEqual({ error: 'type_in_use' });
    });
  });

  describe('does not block the delete', () => {
    it.each<[string, TypeReferences]>([
      ['another type’s pattern', refs({ patterns: [{ typeId: POOL }] })],
      ['yesterday’s override', refs({ overrides: [{ date: '2026-11-15', windows: [{ typeId: STUDIO }] }] })],
      ['a future override without the type', refs({ overrides: [{ date: '2026-11-20', windows: [{ typeId: POOL }] }] })],
      ['a future override with no windows', refs({ overrides: [{ date: '2026-11-20', windows: [] }] })],
      ['yesterday’s one-off window', refs({ oneOffs: [{ date: '2026-11-15', typeId: STUDIO }] })],
      ['an appointment that has ended', refs({ appointments: [appt(STUDIO, 'booked', '2026-11-16T09:00:00.000Z')] })],
      ['an appointment that ends exactly now', refs({ appointments: [appt(STUDIO, 'booked', NOW)] })],
      ['a cancelled future appointment', refs({ appointments: [appt(STUDIO, 'cancelled', '2026-11-20T09:00:00.000Z')] })],
      ['another type’s future appointment', refs({ appointments: [appt(POOL, 'booked', '2026-11-20T09:00:00.000Z')] })],
    ])('%s', (_, references) => {
      expect(checkTypeDelete(STUDIO, references, TODAY, NOW)).toBeNull();
    });
  });
});

// ── Availability writes (spec 6.5, 6.7) ──────────────────────────────────────────────────────

describe('checkAvailabilityWrite', () => {
  // AC-04: now 2026-11-10 (a Tuesday), Europe/Rome (UTC+1 in November).
  const ZONE = 'Europe/Rome';
  const TODAY = '2026-11-10';
  const NOW = '2026-11-10T09:00:00.000Z';
  const P1 = '01JC00000000000000000000P1';
  const P2 = '01JC00000000000000000000P2';
  const W1 = '01JC00000000000000000000W1';
  const W2 = '01JC00000000000000000000W2';
  // Pattern Mon 08:00–12:00 Studio from 2026-11-01, no end (AC-04).
  const ac04 = { patternId: P1, weekday: 1, start: '08:00', end: '12:00', typeId: STUDIO, validFrom: '2026-11-01', validUntil: null };
  const state = (more: Partial<CalendarState> = {}): CalendarState => ({
    types: [{ typeId: STUDIO }, { typeId: POOL }],
    patterns: [ac04],
    overrides: [],
    oneOffs: [],
    appointments: [],
    ...more,
  });
  const check = (write: AvailabilityWrite, s: CalendarState = state(), today = TODAY, now = NOW) =>
    checkAvailabilityWrite(write, s, today, now, ZONE);
  const pattern = (more: object = {}, patternId = P2) => ({ kind: 'pattern' as const, patternId, pattern: { ...ac04, patternId, ...more } });
  const oneOff = (date: string, start: string, end: string, typeId = POOL, windowId = W1) => ({ windowId, date, start, end, typeId });
  // Monday 2026-11-16, 09:00–10:00 local = 08:00Z–09:00Z (AC-10).
  const appt = (more: Partial<StateAppointment> = {}): StateAppointment => ({
    appointmentId: 'A1',
    userId: 'sub-alice',
    username: 'alice',
    start: '2026-11-16T08:00:00.000Z',
    end: '2026-11-16T09:00:00.000Z',
    date: '2026-11-16',
    typeId: STUDIO,
    status: 'booked',
    ...more,
  });
  const conflict = (a: StateAppointment) => ({ appointmentId: a.appointmentId, username: a.username, start: a.start, end: a.end });

  describe('create or update a pattern, against the other patterns', () => {
    it('AC-05: Mon 11:00–13:00 Pool, same validity, overlaps; the message names the first shared date and both windows', () => {
      expect(check(pattern({ start: '11:00', end: '13:00', typeId: POOL }))).toEqual({
        error: 'availability_overlap',
        message: 'On 2026-11-02 the window 11:00–13:00 would overlap the window 08:00–12:00',
      });
    });

    it.each([
      ['touching, another type', { start: '12:00', end: '13:00', typeId: POOL }],
      ['touching, same type', { start: '06:00', end: '08:00' }],
      ['another weekday', { weekday: 2 }],
      ['a validity that ends the day before', { validFrom: '2026-01-01', validUntil: '2026-10-31' }],
      ['a validity between two Mondays only', { validFrom: '2026-11-03', validUntil: '2026-11-08' }],
    ])('allows %s', (_, more) => {
      expect(check(pattern(more))).toBeNull();
    });

    it('counts an inclusive validUntil: both apply on Monday 2026-11-30', () => {
      const ending = { ...ac04, validUntil: '2026-11-30' };
      expect(check(pattern({ validFrom: '2026-11-30' }), state({ patterns: [ending] }))).toEqual(
        expect.objectContaining({ error: 'availability_overlap', message: expect.stringContaining('On 2026-11-30') }),
      );
      expect(check(pattern({ validFrom: '2026-12-01' }), state({ patterns: [ending] }))).toBeNull();
    });

    it('treats an open end on either side as no end', () => {
      expect(check(pattern({ validFrom: '2030-01-01' }))).toEqual(expect.objectContaining({ error: 'availability_overlap' }));
      const later = { ...ac04, validFrom: '2030-01-01' };
      expect(check(pattern({ validFrom: '2026-01-01', validUntil: null }), state({ patterns: [later] }))).toEqual(
        expect.objectContaining({ message: expect.stringContaining('On 2030-01-07') }),
      );
    });

    it('refuses two patterns that both lie in the past: an overlap on any date is an overlap', () => {
      const old = { ...ac04, validFrom: '2025-01-01', validUntil: '2025-01-31' };
      expect(check(pattern({ validFrom: '2025-01-01', validUntil: '2025-01-31' }), state({ patterns: [old] }))).toEqual(
        expect.objectContaining({ error: 'availability_overlap', message: expect.stringContaining('On 2025-01-06') }),
      );
    });

    it('lets an update keep, shrink or move its own window: it is not compared with its old version', () => {
      expect(check({ kind: 'pattern', patternId: P1, pattern: { ...ac04, start: '09:00', end: '13:00' } })).toBeNull();
    });

    it('refuses an update that clashes with another pattern', () => {
      const other = { ...ac04, patternId: P2, start: '12:00', end: '13:00' };
      expect(check({ kind: 'pattern', patternId: P1, pattern: { ...ac04, end: '12:30' } }, state({ patterns: [ac04, other] }))).toEqual(
        expect.objectContaining({ error: 'availability_overlap' }),
      );
    });

    it('compares local times: 02:00–02:30 and 03:00–04:00 on the spring-forward Sunday do not overlap', () => {
      const night = { ...ac04, weekday: 7, start: '03:00', end: '04:00', validFrom: '2027-03-01', validUntil: '2027-04-30' };
      expect(check(pattern({ weekday: 7, start: '02:00', end: '02:30', validFrom: '2027-03-01', validUntil: '2027-04-30' }), state({ patterns: [night] }))).toBeNull();
    });
  });

  describe('create or update a pattern, against the one-off windows from today on', () => {
    it('refuses an overlap with a future one-off window on a date where the pattern applies', () => {
      const s = state({ patterns: [], oneOffs: [oneOff('2026-11-16', '11:00', '13:00')] });
      expect(check(pattern(), s)).toEqual({
        error: 'availability_overlap',
        message: 'On 2026-11-16 the window 08:00–12:00 would overlap the window 11:00–13:00',
      });
    });

    it.each([
      ['on a date with an override', { overrides: [{ date: '2026-11-16', windows: [] }] }],
      ['in the past (R-AV-02)', { oneOffs: [oneOff('2026-11-09', '11:00', '13:00')] }],
      ['on another weekday', { oneOffs: [oneOff('2026-11-17', '11:00', '13:00')] }],
      ['touching', { oneOffs: [oneOff('2026-11-16', '12:00', '13:00')] }],
    ])('ignores or allows a one-off window %s', (_, more) => {
      expect(check(pattern(), state({ patterns: [], oneOffs: [oneOff('2026-11-16', '11:00', '13:00')], ...more }))).toBeNull();
    });

    it('ignores a one-off window outside the pattern’s validity', () => {
      const s = state({ patterns: [], oneOffs: [oneOff('2026-11-23', '11:00', '13:00')] });
      expect(check(pattern({ validUntil: '2026-11-16' }), s)).toBeNull();
    });

    it('compares local times on the spring-forward Sunday', () => {
      const s = state({ patterns: [], oneOffs: [oneOff('2027-03-28', '02:00', '02:30')] });
      expect(check(pattern({ weekday: 7, start: '03:00', end: '04:00' }), s)).toBeNull();
    });
  });

  describe('pattern limits and types', () => {
    // 49 or 50 patterns that never share a date: one January each, in years gone by.
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ ...ac04, patternId: `P${i}`, validFrom: `${1950 + i}-01-01`, validUntil: `${1950 + i}-01-31` }));

    it('allows the 50th pattern and refuses the 51st with limit_reached (R-PAT-04)', () => {
      expect(check(pattern(), state({ patterns: many(49) }))).toBeNull();
      expect(check(pattern(), state({ patterns: many(50) }))).toEqual({ error: 'limit_reached' });
    });

    it('does not count an update against the limit', () => {
      const fifty = many(50);
      expect(check({ kind: 'pattern', patternId: 'P0', pattern: { ...fifty[0]!, end: '11:00' } }, state({ patterns: fifty }))).toBeNull();
    });

    it('answers type_not_found for an unknown type, before the limit and the overlap (R-TYPE-04)', () => {
      expect(check(pattern({ typeId: '01JC0000000000000000000099' }), state({ patterns: [...many(50), ac04] }))).toEqual({
        error: 'type_not_found',
      });
    });

    it('answers limit_reached before an overlap', () => {
      expect(check(pattern(), state({ patterns: [...many(49), ac04] }))).toEqual({ error: 'limit_reached' });
    });
  });

  describe('set an override on a date', () => {
    const set = (windows: { start: string; end: string; typeId: string }[], date = '2026-11-16') => ({ kind: 'override' as const, date, windows });

    it('allows windows that touch, and the empty list', () => {
      expect(check(set([{ start: '09:00', end: '12:00', typeId: STUDIO }, { start: '12:00', end: '13:00', typeId: POOL }]))).toBeNull();
      expect(check(set([]))).toBeNull();
    });

    it('refuses its own windows overlapping each other', () => {
      expect(check(set([{ start: '09:00', end: '12:00', typeId: STUDIO }, { start: '11:00', end: '13:00', typeId: POOL }]))).toEqual({
        error: 'availability_overlap',
        message: 'On 2026-11-16 the window 09:00–12:00 would overlap the window 11:00–13:00',
      });
    });

    it('replaces the patterns of the date, but not its one-off windows', () => {
      // 13:00–14:00 overlaps no pattern (replaced) but the one-off window.
      const s = state({ oneOffs: [oneOff('2026-11-16', '13:30', '15:00')] });
      expect(check(set([{ start: '08:00', end: '11:00', typeId: POOL }]), s)).toBeNull();
      expect(check(set([{ start: '13:00', end: '14:00', typeId: POOL }]), s)).toEqual(expect.objectContaining({ error: 'availability_overlap' }));
    });

    it('answers type_not_found for a window of an unknown type', () => {
      expect(check(set([{ start: '09:00', end: '10:00', typeId: '01JC0000000000000000000099' }]))).toEqual({ error: 'type_not_found' });
    });
  });

  describe('delete an override', () => {
    it('refuses when the patterns that apply again overlap a one-off window of the date', () => {
      const s = state({ overrides: [{ date: '2026-11-16', windows: [] }], oneOffs: [oneOff('2026-11-16', '10:00', '11:00')] });
      expect(check({ kind: 'override', date: '2026-11-16', windows: null }, s)).toEqual({
        error: 'availability_overlap',
        message: 'On 2026-11-16 the window 08:00–12:00 would overlap the window 10:00–11:00',
      });
    });

    it('allows it when nothing clashes', () => {
      const s = state({ overrides: [{ date: '2026-11-16', windows: [] }], oneOffs: [oneOff('2026-11-16', '12:00', '13:00')] });
      expect(check({ kind: 'override', date: '2026-11-16', windows: null }, s)).toBeNull();
    });
  });

  describe('create a one-off window', () => {
    const add = (date: string, start: string, end: string, typeId = POOL, windowId = W2) => ({
      kind: 'one_off' as const,
      windowId,
      window: oneOff(date, start, end, typeId, windowId),
    });

    it('refuses an overlap with the patterns of its date (AC-09)', () => {
      expect(check(add('2026-11-16', '11:00', '12:30'))).toEqual({
        error: 'availability_overlap',
        message: 'On 2026-11-16 the window 08:00–12:00 would overlap the window 11:00–12:30',
      });
    });

    it('allows a touching window (AC-08), also on a date without the pattern', () => {
      expect(check(add('2026-11-16', '12:00', '13:00', STUDIO))).toBeNull();
      expect(check(add('2026-11-17', '08:00', '12:00'))).toBeNull();
    });

    it('checks the override’s windows instead of the patterns on a date with an override', () => {
      const s = state({ overrides: [{ date: '2026-11-16', windows: [{ start: '14:00', end: '15:00', typeId: STUDIO }] }] });
      expect(check(add('2026-11-16', '09:00', '10:00'), s)).toBeNull();
      expect(check(add('2026-11-16', '14:30', '16:00'), s)).toEqual(expect.objectContaining({ error: 'availability_overlap' }));
    });

    it('refuses an overlap with another one-off window of the date', () => {
      const s = state({ oneOffs: [oneOff('2026-11-17', '09:00', '10:00')] });
      expect(check(add('2026-11-17', '09:30', '10:30'), s)).toEqual(expect.objectContaining({ error: 'availability_overlap' }));
    });

    it('allows the 10th one-off window of a date and refuses the 11th (R-ONE-03)', () => {
      const nine = Array.from({ length: 9 }, (_, i) => oneOff('2026-11-17', `0${i}:00`, `0${i}:30`, POOL, `W${i}`));
      expect(check(add('2026-11-17', '20:00', '21:00'), state({ oneOffs: nine }))).toBeNull();
      const ten = [...nine, oneOff('2026-11-17', '09:00', '09:30', POOL, 'W9')];
      expect(check(add('2026-11-17', '20:00', '21:00'), state({ oneOffs: ten }))).toEqual({ error: 'limit_reached' });
    });

    it('answers type_not_found for an unknown type', () => {
      expect(check(add('2026-11-17', '09:00', '10:00', '01JC0000000000000000000099'))).toEqual({ error: 'type_not_found' });
    });
  });

  describe('delete a one-off window', () => {
    it('never overlaps', () => {
      expect(check({ kind: 'one_off', windowId: W1, window: null }, state({ oneOffs: [oneOff('2026-11-16', '12:00', '13:00')] }))).toBeNull();
    });
  });

  describe('conflicts with appointments (R-AV-03, R-AV-04)', () => {
    it('AC-25: an override [] on the appointment’s date lists it, and the message has no username', () => {
      const a = appt();
      const refusal = check({ kind: 'override', date: '2026-11-16', windows: [] }, state({ appointments: [a] }));
      expect(refusal).toEqual({ error: 'availability_conflict', message: '1 appointment would fall outside the availability', conflicts: [conflict(a)] });
      expect(refusal?.message).not.toContain('alice');
    });

    it('AC-26: changing the pattern’s type is a conflict', () => {
      expect(check({ kind: 'pattern', patternId: P1, pattern: { ...ac04, typeId: POOL } }, state({ appointments: [appt()] }))).toEqual(
        expect.objectContaining({ error: 'availability_conflict', conflicts: [conflict(appt())] }),
      );
    });

    it('AC-27: extending the pattern to 07:00–12:00 is not', () => {
      expect(check({ kind: 'pattern', patternId: P1, pattern: { ...ac04, start: '07:00' } }, state({ appointments: [appt()] }))).toBeNull();
    });

    it('shrinking the window so that it cuts the appointment is a conflict', () => {
      expect(check({ kind: 'pattern', patternId: P1, pattern: { ...ac04, start: '09:30' } }, state({ appointments: [appt()] }))).toEqual(
        expect.objectContaining({ error: 'availability_conflict' }),
      );
    });

    it('deleting the pattern is a conflict', () => {
      expect(check({ kind: 'pattern', patternId: P1, pattern: null }, state({ appointments: [appt()] }))).toEqual(
        expect.objectContaining({ error: 'availability_conflict' }),
      );
    });

    it('moving the pattern to another weekday is a conflict on the weekday it leaves', () => {
      expect(check({ kind: 'pattern', patternId: P1, pattern: { ...ac04, weekday: 2 } }, state({ appointments: [appt()] }))).toEqual(
        expect.objectContaining({ error: 'availability_conflict' }),
      );
    });

    it('ending the pattern before the appointment’s date is a conflict', () => {
      expect(check({ kind: 'pattern', patternId: P1, pattern: { ...ac04, validUntil: '2026-11-15' } }, state({ appointments: [appt()] }))).toEqual(
        expect.objectContaining({ error: 'availability_conflict' }),
      );
    });

    it('an appointment in progress counts', () => {
      const now = '2026-11-16T08:30:00.000Z';
      expect(check({ kind: 'pattern', patternId: P1, pattern: null }, state({ appointments: [appt()] }), '2026-11-16', now)).toEqual(
        expect.objectContaining({ error: 'availability_conflict' }),
      );
    });

    it.each([
      ['has ended', appt(), '2026-11-16T09:00:00.000Z'],
      ['is cancelled', appt({ status: 'cancelled' }), NOW],
    ])('an appointment that %s does not', (_, a, now) => {
      expect(check({ kind: 'pattern', patternId: P1, pattern: null }, state({ appointments: [a] }), '2026-11-16', now)).toBeNull();
    });

    it('lists several conflicts in start order', () => {
      const later = appt({ appointmentId: 'A2', username: 'bob', start: '2026-11-16T10:00:00.000Z', end: '2026-11-16T11:00:00.000Z' });
      const earlier = appt();
      expect(check({ kind: 'pattern', patternId: P1, pattern: null }, state({ appointments: [later, earlier] }))).toEqual({
        error: 'availability_conflict',
        message: '2 appointments would fall outside the availability',
        conflicts: [conflict(earlier), conflict(later)],
      });
    });

    it('looks only at the dates the write touches', () => {
      // An appointment on a Tuesday with no availability (not possible through the API) is not this write's business.
      const tuesday = appt({ start: '2026-11-17T08:00:00.000Z', end: '2026-11-17T09:00:00.000Z', date: '2026-11-17' });
      expect(check({ kind: 'pattern', patternId: P1, pattern: { ...ac04, start: '07:00' } }, state({ appointments: [tuesday] }))).toBeNull();
      expect(check({ kind: 'override', date: '2026-11-23', windows: [] }, state({ appointments: [appt()] }))).toBeNull();
    });

    it('an appointment inside merged windows of its type stays (pattern + one-off, 6.6)', () => {
      // 11:00–13:00 local = 10:00Z–12:00Z, across the pattern (to 12:00) and a one-off window 12:00–13:00 Studio.
      const across = appt({ start: '2026-11-16T10:00:00.000Z', end: '2026-11-16T12:00:00.000Z' });
      const s = state({ appointments: [across], oneOffs: [oneOff('2026-11-16', '12:00', '13:00', STUDIO)] });
      expect(check({ kind: 'pattern', patternId: P1, pattern: { ...ac04, start: '07:00' } }, s)).toBeNull();
      expect(check({ kind: 'one_off', windowId: W1, window: null }, s)).toEqual(expect.objectContaining({ error: 'availability_conflict' }));
    });

    it('deleting an override whose window held the appointment is a conflict', () => {
      const tuesday = appt({ start: '2026-11-17T08:00:00.000Z', end: '2026-11-17T09:00:00.000Z', date: '2026-11-17' });
      const s = state({ overrides: [{ date: '2026-11-17', windows: [{ start: '08:00', end: '12:00', typeId: STUDIO }] }], appointments: [tuesday] });
      expect(check({ kind: 'override', date: '2026-11-17', windows: null }, s)).toEqual(expect.objectContaining({ error: 'availability_conflict' }));
    });

    it('compares instants on a DST date: the spring-forward Sunday 01:00–04:00 holds 01:00–03:00 local', () => {
      const sunday = { ...ac04, weekday: 7, start: '01:00', end: '04:00', validFrom: '2027-03-01' };
      // 01:00 local = 00:00Z; 03:00 local (CEST) = 01:00Z; 04:00 local = 02:00Z.
      const a = appt({ start: '2027-03-28T00:00:00.000Z', end: '2027-03-28T01:00:00.000Z', date: '2027-03-28' });
      const s = state({ patterns: [sunday], appointments: [a] });
      expect(check({ kind: 'pattern', patternId: P1, pattern: { ...sunday, end: '03:00' } }, s)).toBeNull();
      expect(check({ kind: 'pattern', patternId: P1, pattern: { ...sunday, start: '03:00' } }, s)).toEqual(
        expect.objectContaining({ error: 'availability_conflict' }),
      );
    });

    it('answers an overlap before a conflict', () => {
      const s = state({ appointments: [appt()], oneOffs: [oneOff('2026-11-16', '12:00', '13:00')] });
      expect(check({ kind: 'pattern', patternId: P1, pattern: { ...ac04, typeId: POOL, end: '12:30' } }, s)).toEqual(
        expect.objectContaining({ error: 'availability_overlap' }),
      );
    });
  });
});
