import type { DateOverride, OneOffWindow, WeeklyPattern } from '@shared-calendar/shared';
import { AvailabilityRulesService } from '../../../src/services/availability-rules.service';
import { SessionStore } from '../../../src/services/session.store';
import { json, session } from './fixtures';
import { CONFIG, describeMethod, type MethodSpec } from './suite';

// docs/FRONTEND_SERVICES.md section 17.8: the per-method suite of suite.ts for the eight methods.
// `conflicts` itself is proven in api.test.ts; here once per route that can answer it.

const TYPE_ID = '01JCAAAAAAAAAAAAAAAAAAAAAA';
const PATTERN_ID = '01JCPPPPPPPPPPPPPPPPPPPPPP';
const WINDOW_ID = '01JCWWWWWWWWWWWWWWWWWWWWWW';
const DATE = '2027-10-11';
const AT = '2026-11-15T09:00:00.000Z';

const PATTERN = { weekday: 1, start: '08:00', end: '12:00', typeId: TYPE_ID, validFrom: '2027-01-04', validUntil: null };
const STORED_PATTERN: WeeklyPattern = { ...PATTERN, patternId: PATTERN_ID, createdAt: AT, updatedAt: AT };
const WINDOWS = [{ start: '14:00', end: '24:00', typeId: TYPE_ID }];
const OVERRIDE: DateOverride = { date: DATE, windows: WINDOWS, updatedAt: AT };
const WINDOW = { date: DATE, start: '15:00', end: '17:00', typeId: TYPE_ID };
const STORED_WINDOW: OneOffWindow = { ...WINDOW, windowId: WINDOW_ID, createdAt: AT };
const NO_CONTENT = () => new Response(null, { status: 204 });

type S = AvailabilityRulesService;
const make = (store: ConstructorParameters<typeof AvailabilityRulesService>[1]) => new AvailabilityRulesService(CONFIG, store);

const loadPatterns: MethodSpec<S> = {
  name: 'loadPatterns',
  result$: (s) => s.patternsResult$,
  state$: (s) => s.patternsState$,
  call: (s) => s.loadPatterns(),
  pending: { status: 'pending' },
  request: { method: 'GET', path: '/calendar/patterns' },
  ok: () => json(200, { patterns: [STORED_PATTERN] }),
  success: { status: 'success', patterns: [STORED_PATTERN] },
  wrong: [
    ['200 without patterns', () => json(200, { types: [] })],
    ['an element without patternId', () => json(200, { patterns: [PATTERN] })],
  ],
  codes: ['forbidden', 'internal_error'],
};

const createPattern: MethodSpec<S> = {
  name: 'createPattern',
  result$: (s) => s.createPatternResult$,
  state$: (s) => s.createPatternState$,
  call: (s) => s.createPattern(PATTERN),
  pending: { status: 'pending', pattern: PATTERN },
  request: { method: 'POST', path: '/calendar/patterns', body: PATTERN },
  ok: () => json(201, STORED_PATTERN),
  success: { status: 'success', pattern: STORED_PATTERN },
  wrong: [
    ['200 instead of 201', () => json(200, STORED_PATTERN)],
    ['201 without patternId', () => json(201, PATTERN)],
  ],
  codes: [
    'forbidden',
    'invalid_json',
    'invalid_request',
    'type_not_found',
    'limit_reached',
    'availability_overlap',
    'availability_conflict',
    'concurrent_update',
    'internal_error',
  ],
  notCodes: ['pattern_not_found', 'date_in_past'],
  invalid: [
    ['end before start', (s) => s.createPattern({ ...PATTERN, start: '12:00', end: '08:00' }), 'end: end must be after start'],
    ['off the 15-minute grid', (s) => s.createPattern({ ...PATTERN, start: '08:10' }), 'start: expected HH:mm on the 15-minute grid'],
    ['weekday 8', (s) => s.createPattern({ ...PATTERN, weekday: 8 }), 'weekday: Too big: expected number to be <=7'],
    ['validUntil before validFrom', (s) => s.createPattern({ ...PATTERN, validUntil: '2027-01-03' }), 'validUntil: validUntil must not be before validFrom'],
    ['an unknown field', (s) => s.createPattern({ ...PATTERN, note: 'x' } as never), 'Unrecognized key: "note"'],
  ],
};

const updatePattern: MethodSpec<S> = {
  name: 'updatePattern',
  result$: (s) => s.updatePatternResult$,
  state$: (s) => s.updatePatternState$,
  call: (s) => s.updatePattern(PATTERN_ID, PATTERN),
  pending: { status: 'pending', patternId: PATTERN_ID, pattern: PATTERN },
  request: { method: 'PUT', path: `/calendar/patterns/${PATTERN_ID}`, body: PATTERN },
  ok: () => json(200, STORED_PATTERN),
  success: { status: 'success', pattern: STORED_PATTERN },
  wrong: [['201 instead of 200', () => json(201, STORED_PATTERN)]],
  codes: [
    'forbidden',
    'invalid_json',
    'invalid_request',
    'pattern_not_found',
    'type_not_found',
    'availability_overlap',
    'availability_conflict',
    'concurrent_update',
    'internal_error',
  ],
  // An update never adds a pattern, so docs/ARCHITECTURE.md section 4 lists no limit_reached here
  // (docs/FRONTEND_SERVICES.md section 8, decision 32).
  notCodes: ['limit_reached'],
  invalid: [
    ['patternId not a ULID', (s) => s.updatePattern('p1', PATTERN), 'patternId: expected a ULID'],
    ['a bad body', (s) => s.updatePattern(PATTERN_ID, { ...PATTERN, validFrom: '2027-02-30' }), 'validFrom: not a real date'],
  ],
};

const deletePattern: MethodSpec<S> = {
  name: 'deletePattern',
  result$: (s) => s.deletePatternResult$,
  state$: (s) => s.deletePatternState$,
  call: (s) => s.deletePattern(PATTERN_ID),
  pending: { status: 'pending', patternId: PATTERN_ID },
  request: { method: 'DELETE', path: `/calendar/patterns/${PATTERN_ID}` },
  ok: NO_CONTENT,
  success: { status: 'success', patternId: PATTERN_ID },
  wrong: [['200 with the pattern', () => json(200, STORED_PATTERN)]],
  codes: ['forbidden', 'invalid_request', 'pattern_not_found', 'availability_conflict', 'concurrent_update', 'internal_error'],
  // Removing a pattern cannot create an overlap (docs/SHARED_CALENDAR_SPEC.md section 11.1,
  // footnote 1; docs/FRONTEND_SERVICES.md section 8, decision 32), and a delete reads no body, so
  // invalid_json cannot happen either.
  notCodes: ['availability_overlap', 'invalid_json'],
  invalid: [['patternId not a ULID', (s) => s.deletePattern(''), 'patternId: expected a ULID']],
};

const setOverride: MethodSpec<S> = {
  name: 'setOverride',
  result$: (s) => s.setOverrideResult$,
  state$: (s) => s.setOverrideState$,
  call: (s) => s.setOverride(DATE, WINDOWS),
  pending: { status: 'pending', date: DATE, windows: WINDOWS },
  request: { method: 'PUT', path: `/calendar/overrides/${DATE}`, body: { windows: WINDOWS } },
  ok: () => json(200, OVERRIDE),
  success: { status: 'success', override: OVERRIDE },
  wrong: [
    ['201 instead of 200', () => json(201, OVERRIDE)],
    ['200 without date', () => json(200, { windows: WINDOWS })],
  ],
  codes: [
    'forbidden',
    'invalid_json',
    'invalid_request',
    'date_in_past',
    'type_not_found',
    'availability_overlap',
    'availability_conflict',
    'concurrent_update',
    'internal_error',
  ],
  notCodes: ['override_not_found', 'limit_reached'],
  invalid: [
    ['not a real date', (s) => s.setOverride('2027-02-29', WINDOWS), 'date: not a real date'],
    ['a window ending before it starts', (s) => s.setOverride(DATE, [WINDOWS[0], { ...WINDOWS[0], start: '10:00', end: '09:00' }] as never), 'windows.1.end: end must be after start'],
    ['11 windows', (s) => s.setOverride(DATE, Array(11).fill(WINDOWS[0])), 'windows: Too big: expected array to have <=10 items'],
  ],
};

const deleteOverride: MethodSpec<S> = {
  name: 'deleteOverride',
  result$: (s) => s.deleteOverrideResult$,
  state$: (s) => s.deleteOverrideState$,
  call: (s) => s.deleteOverride(DATE),
  pending: { status: 'pending', date: DATE },
  request: { method: 'DELETE', path: `/calendar/overrides/${DATE}` },
  ok: NO_CONTENT,
  success: { status: 'success', date: DATE },
  wrong: [['200 {}', () => json(200, {})]],
  codes: [
    'forbidden',
    'invalid_request',
    'override_not_found',
    'date_in_past',
    'availability_overlap',
    'availability_conflict',
    'concurrent_update',
    'internal_error',
  ],
  notCodes: ['type_not_found'],
  invalid: [['a date with a time', (s) => s.deleteOverride('2027-10-11T00:00'), 'date: expected YYYY-MM-DD']],
};

const createWindow: MethodSpec<S> = {
  name: 'createWindow',
  result$: (s) => s.createWindowResult$,
  state$: (s) => s.createWindowState$,
  call: (s) => s.createWindow(WINDOW),
  pending: { status: 'pending', window: WINDOW },
  request: { method: 'POST', path: '/calendar/windows', body: WINDOW },
  ok: () => json(201, STORED_WINDOW),
  success: { status: 'success', window: STORED_WINDOW },
  wrong: [
    ['200 instead of 201', () => json(200, STORED_WINDOW)],
    ['201 without windowId', () => json(201, WINDOW)],
  ],
  codes: [
    'forbidden',
    'invalid_json',
    'invalid_request',
    'date_in_past',
    'type_not_found',
    'limit_reached',
    'availability_overlap',
    'concurrent_update',
    'internal_error',
  ],
  // A new window never conflicts (docs/SHARED_CALENDAR_SPEC.md R-AV-04).
  notCodes: ['availability_conflict', 'window_not_found'],
  invalid: [
    // The union's first branch.
    ['end 24:15', (s) => s.createWindow({ ...WINDOW, end: '24:15' }), 'end: expected HH:mm on the 15-minute grid'],
    ['start 24:00', (s) => s.createWindow({ ...WINDOW, start: '24:00' }), 'start: expected HH:mm on the 15-minute grid'],
    ['typeId missing', (s) => s.createWindow({ ...WINDOW, typeId: undefined } as never), 'typeId: Invalid input: expected string, received undefined'],
  ],
};

const deleteWindow: MethodSpec<S> = {
  name: 'deleteWindow',
  result$: (s) => s.deleteWindowResult$,
  state$: (s) => s.deleteWindowState$,
  call: (s) => s.deleteWindow(WINDOW_ID),
  pending: { status: 'pending', windowId: WINDOW_ID },
  request: { method: 'DELETE', path: `/calendar/windows/${WINDOW_ID}` },
  ok: NO_CONTENT,
  success: { status: 'success', windowId: WINDOW_ID },
  wrong: [['201 {}', () => json(201, {})]],
  codes: ['forbidden', 'invalid_request', 'window_not_found', 'date_in_past', 'availability_conflict', 'concurrent_update', 'internal_error'],
  notCodes: ['availability_overlap'],
  invalid: [['windowId with an I', (s) => s.deleteWindow('01JCIIIIIIIIIIIIIIIIIIIIII'), 'windowId: expected a ULID']],
};

describe('AvailabilityRulesService', () => {
  const all = [loadPatterns, createPattern, updatePattern, deletePattern, setOverride, deleteOverride, createWindow, deleteWindow];
  all.forEach((spec, i) => describeMethod(make, spec, all[(i + 1) % all.length] as MethodSpec<S>));

  // The routes that can answer availability_conflict hand its list to the view
  // (docs/SHARED_CALENDAR_SPEC.md section 16.3).
  const CONFLICT = { appointmentId: '01JCZZZZZZZZZZZZZZZZZZZZZZ', username: 'alice', start: '2027-10-11T07:00:00.000Z', end: '2027-10-11T08:00:00.000Z' };
  it.each([createPattern, updatePattern, deletePattern, setOverride, deleteOverride, deleteWindow].map((spec) => [spec.name, spec]))(
    '%s: availability_conflict carries conflicts',
    async (_name, spec) => {
      const fetchMock = vi.fn().mockResolvedValueOnce(json(409, { error: 'availability_conflict', message: '1 appointment', conflicts: [CONFLICT] }));
      vi.stubGlobal('fetch', fetchMock);
      const store = new SessionStore();
      store.set(session({ role: 'admin' }));
      const service = make(store);
      const results: unknown[] = [];
      spec.result$(service).subscribe((r) => results.push(r));
      spec.call(service);
      await vi.waitFor(() => expect(results).toHaveLength(1));
      expect(results[0]).toEqual({ status: 'failure', reason: 'availability_conflict', message: '1 appointment', conflicts: [CONFLICT] });
      store.clear();
      vi.unstubAllGlobals();
    },
  );
});
