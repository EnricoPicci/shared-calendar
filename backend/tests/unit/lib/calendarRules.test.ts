import { checkTypeDelete, checkTypeName, typeNameKey, type NamedType, type TypeReferences } from '../../../src/lib/calendarRules';

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
  const none: TypeReferences = { patterns: [], overrides: [], windows: [], appointments: [] };
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
      ['a one-off window dated today', refs({ windows: [{ date: TODAY, typeId: STUDIO }] })],
      ['a future one-off window', refs({ windows: [{ date: '2026-11-17', typeId: STUDIO }] })],
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
      ['yesterday’s one-off window', refs({ windows: [{ date: '2026-11-15', typeId: STUDIO }] })],
      ['an appointment that has ended', refs({ appointments: [appt(STUDIO, 'booked', '2026-11-16T09:00:00.000Z')] })],
      ['an appointment that ends exactly now', refs({ appointments: [appt(STUDIO, 'booked', NOW)] })],
      ['a cancelled future appointment', refs({ appointments: [appt(STUDIO, 'cancelled', '2026-11-20T09:00:00.000Z')] })],
      ['another type’s future appointment', refs({ appointments: [appt(POOL, 'booked', '2026-11-20T09:00:00.000Z')] })],
    ])('%s', (_, references) => {
      expect(checkTypeDelete(STUDIO, references, TODAY, NOW)).toBeNull();
    });
  });
});
