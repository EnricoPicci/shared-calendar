import type { Appointment } from '@shared-calendar/shared';
import { AppointmentsService } from '../../../src/services/appointments.service';
import { SessionStore } from '../../../src/services/session.store';
import { call, json, session } from './fixtures';
import { CONFIG, describeMethod, type MethodSpec } from './suite';

// docs/FRONTEND_SERVICES.md section 19.8: the per-method suite of suite.ts for the five methods,
// then what the suite cannot say: the query's default, the trimmed note, what is left to the API.

const ID = '01JCAAAAAAAAAAAAAAAAAAAAAA';
const NEW_ID = '01JCBBBBBBBBBBBBBBBBBBBBBB';
const TYPE_ID = '01JCTTTTTTTTTTTTTTTTTTTTTT';
const START = '2027-10-11T08:00:00.000Z';
const END = '2027-10-11T09:00:00.000Z';
const AT = '2026-11-15T09:00:00.000Z';
const ADMIN = { username: 'admin', role: 'admin' } as const;

const APPOINTMENT: Appointment = {
  appointmentId: ID,
  username: 'alice',
  start: START,
  end: END,
  date: '2027-10-11',
  typeId: TYPE_ID,
  typeName: 'Studio',
  note: 'First lesson',
  status: 'booked',
  createdAt: AT,
  createdBy: ADMIN,
  updatedAt: AT,
  updatedBy: ADMIN,
  cancelledAt: null,
  cancelledBy: null,
  cancelReason: null,
  replaces: null,
  replacedBy: null,
  cancellableUntil: null,
};
const CANCELLED: Appointment = { ...APPOINTMENT, status: 'cancelled', cancelledAt: AT, cancelledBy: ADMIN, cancelReason: 'cancelled' };
const BOOKED: Appointment = { ...APPOINTMENT, appointmentId: NEW_ID, start: '2027-10-11T10:00:00.000Z', end: '2027-10-11T11:00:00.000Z', replaces: ID };
const REPLACED: Appointment = { ...CANCELLED, cancelReason: 'changed', replacedBy: NEW_ID };
const NOT_A_ULID: [string, string, string] = ['an id with an I', '01JCIIIIIIIIIIIIIIIIIIIIII', 'appointmentId: expected a ULID'];

type S = AppointmentsService;
const make = (store: SessionStore) => new AppointmentsService(CONFIG, store);

const QUERY = { from: '2027-10-11', to: '2027-10-17', username: 'alice', status: 'all' } as const;
const list: MethodSpec<S> = {
  name: 'list',
  result$: (s) => s.appointmentsResult$,
  state$: (s) => s.appointmentsState$,
  call: (s) => s.list(QUERY),
  pending: { status: 'pending', query: QUERY },
  request: { method: 'GET', path: '/calendar/appointments?from=2027-10-11&to=2027-10-17&username=alice&status=all' },
  ok: () => json(200, { appointments: [APPOINTMENT, CANCELLED] }),
  success: { status: 'success', appointments: [APPOINTMENT, CANCELLED] },
  wrong: [
    ['200 without appointments', () => json(200, { types: [] })],
    ['an element without appointmentId', () => json(200, { appointments: [{ ...APPOINTMENT, appointmentId: undefined }] })],
    ['an element null', () => json(200, { appointments: [null] })],
    ['201 instead of 200', () => json(201, { appointments: [] })],
  ],
  codes: ['forbidden', 'invalid_request', 'internal_error'],
  notCodes: ['invalid_json', 'appointment_not_found'],
  invalid: [
    ['neither selection', (s) => s.list({}), 'upcoming: expected either from and to, or upcoming=true'],
    ['both selections', (s) => s.list({ ...QUERY, upcoming: 'true' }), 'upcoming: expected either from and to, or upcoming=true'],
    ['from alone', (s) => s.list({ from: '2027-10-11' }), 'upcoming: expected either from and to, or upcoming=true'],
    ['93 days', (s) => s.list({ from: '2027-10-01', to: '2028-01-01' }), 'to: the range spans more than 92 days'],
    ['an unknown status', (s) => s.list({ upcoming: 'true', status: 'ended' as never }), 'status: Invalid option: expected one of "booked"|"cancelled"|"all"'],
    ['a bad username', (s) => s.list({ upcoming: 'true', username: 'Alice' }), expect.stringMatching(/^username: /) as never],
  ],
};

const BOOKING = { start: START, username: 'alice', note: '  First lesson  ' };
const book: MethodSpec<S> = {
  name: 'book',
  result$: (s) => s.bookResult$,
  state$: (s) => s.bookState$,
  call: (s) => s.book(BOOKING),
  pending: { status: 'pending', booking: BOOKING },
  request: { method: 'POST', path: '/calendar/appointments', body: { start: START, username: 'alice', note: 'First lesson' } },
  ok: () => json(201, APPOINTMENT),
  success: { status: 'success', appointment: APPOINTMENT },
  wrong: [
    ['200 instead of 201', () => json(200, APPOINTMENT)],
    ['201 without appointmentId', () => json(201, { ...APPOINTMENT, appointmentId: 1 })],
  ],
  codes: [
    'forbidden',
    'invalid_json',
    'invalid_request',
    'user_not_found',
    'target_not_user',
    'booking_in_past',
    'booking_notice_too_short',
    'booking_beyond_horizon',
    'outside_availability',
    'slot_taken',
    'appointment_limit_reached',
    'concurrent_update',
    'internal_error',
  ],
  notCodes: ['appointment_not_found', 'appointment_not_active', 'cancellation_notice_too_short', 'availability_conflict'],
  invalid: [
    ['an instant with seconds', (s) => s.book({ start: '2027-10-11T08:00:30.000Z' }), expect.stringMatching(/^start: /) as never],
    ['end before start', (s) => s.book({ start: START, end: '2027-10-11T07:00:00.000Z' }), 'end: end must be after start'],
    ['a note of 501 characters', (s) => s.book({ start: START, note: 'x'.repeat(501) }), 'note: at most 500 characters'],
    ['a control character in the note', (s) => s.book({ start: START, note: 'a\tb' }), 'note: no control characters except line feed'],
    ['an unknown field', (s) => s.book({ start: START, typeId: TYPE_ID } as never), 'Unrecognized key: "typeId"'],
  ],
};

const cancel: MethodSpec<S> = {
  name: 'cancel',
  result$: (s) => s.cancelResult$,
  state$: (s) => s.cancelState$,
  call: (s) => s.cancel(ID),
  pending: { status: 'pending', appointmentId: ID },
  request: { method: 'POST', path: `/calendar/appointments/${ID}/cancel` },
  ok: () => json(200, CANCELLED),
  success: { status: 'success', appointment: CANCELLED },
  wrong: [
    ['201 instead of 200', () => json(201, CANCELLED)],
    ['204', () => new Response(null, { status: 204 })],
  ],
  codes: [
    'forbidden',
    'invalid_request',
    'appointment_not_found',
    'appointment_not_active',
    'cancellation_notice_too_short',
    'concurrent_update',
    'internal_error',
  ],
  // The route reads no body, and a cancel has no target User.
  notCodes: ['invalid_json', 'user_not_found', 'slot_taken'],
  invalid: [[NOT_A_ULID[0], (s) => s.cancel(NOT_A_ULID[1]), NOT_A_ULID[2]]],
};

const CHANGE = { start: '2027-10-11T10:00:00.000Z', note: null };
const change: MethodSpec<S> = {
  name: 'change',
  result$: (s) => s.changeResult$,
  state$: (s) => s.changeState$,
  call: (s) => s.change(ID, CHANGE),
  pending: { status: 'pending', appointmentId: ID, change: CHANGE },
  request: { method: 'POST', path: `/calendar/appointments/${ID}/change`, body: CHANGE },
  ok: () => json(201, { cancelled: REPLACED, booked: BOOKED }),
  success: { status: 'success', cancelled: REPLACED, booked: BOOKED },
  wrong: [
    ['200 instead of 201', () => json(200, { cancelled: REPLACED, booked: BOOKED })],
    ['201 without booked', () => json(201, { cancelled: REPLACED })],
    ['201 with cancelled lacking its id', () => json(201, { cancelled: { ...REPLACED, appointmentId: null }, booked: BOOKED })],
    ['201 with the new appointment alone', () => json(201, BOOKED)],
  ],
  codes: [
    'forbidden',
    'invalid_json',
    'invalid_request',
    'appointment_not_found',
    'user_not_found',
    'appointment_not_active',
    'cancellation_notice_too_short',
    'booking_in_past',
    'booking_notice_too_short',
    'booking_beyond_horizon',
    'outside_availability',
    'slot_taken',
    'appointment_limit_reached',
    'concurrent_update',
    'internal_error',
  ],
  // The User of a change is the old appointment's: no target to check.
  notCodes: ['target_not_user'],
  invalid: [
    [`${NOT_A_ULID[0]} (with a bad body: the path's message)`, (s) => s.change(NOT_A_ULID[1], { start: 'x' }), NOT_A_ULID[2]],
    ['a username in the body', (s) => s.change(ID, { ...CHANGE, username: 'bob' } as never), 'Unrecognized key: "username"'],
    ['start missing', (s) => s.change(ID, {} as never), 'start: Invalid input: expected string, received undefined'],
  ],
};

const note: MethodSpec<S> = {
  name: 'updateNote',
  result$: (s) => s.updateNoteResult$,
  state$: (s) => s.updateNoteState$,
  call: (s) => s.updateNote(ID, '  Bring shoes \n'),
  pending: { status: 'pending', appointmentId: ID, note: '  Bring shoes \n' },
  request: { method: 'PATCH', path: `/calendar/appointments/${ID}`, body: { note: 'Bring shoes' } },
  ok: () => json(200, { ...APPOINTMENT, note: 'Bring shoes' }),
  success: { status: 'success', appointment: { ...APPOINTMENT, note: 'Bring shoes' } },
  wrong: [
    ['201 instead of 200', () => json(201, APPOINTMENT)],
    ['200 empty', () => new Response(null, { status: 200 })],
  ],
  codes: ['forbidden', 'invalid_json', 'invalid_request', 'appointment_not_found', 'appointment_not_active', 'concurrent_update', 'internal_error'],
  // A note has no notice (docs/SHARED_CALENDAR_SPEC.md R-NOTE-01).
  notCodes: ['cancellation_notice_too_short', 'slot_taken'],
  invalid: [
    [NOT_A_ULID[0], (s) => s.updateNote(NOT_A_ULID[1], 'x'), NOT_A_ULID[2]],
    ['a note of 501 characters', (s) => s.updateNote(ID, 'x'.repeat(501)), 'note: at most 500 characters'],
    ['note missing', (s) => s.updateNote(ID, undefined as never), 'note: Invalid input: expected string, received undefined'],
  ],
};

// Test names: R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
describe('AppointmentsService', () => {
  const all = [list, book, cancel, change, note];
  all.forEach((spec, i) => describeMethod(make, spec, all[(i + 1) % all.length] as MethodSpec<S>));

  describe('what is sent', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    let store: SessionStore;
    let service: S;
    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      store = new SessionStore();
      store.set(session());
      service = make(store);
    });
    afterEach(() => {
      store.clear();
      vi.unstubAllGlobals();
    });

    async function sent<T>(result$: { subscribe: (f: (v: T) => void) => unknown }, trigger: () => void, answer: Response): Promise<[string, RequestInit, T]> {
      fetchMock.mockResolvedValueOnce(answer);
      const results: T[] = [];
      result$.subscribe((r) => results.push(r));
      trigger();
      await vi.waitFor(() => expect(results).toHaveLength(1));
      const [url, init] = call(fetchMock);
      return [url, init, results[0] as T];
    }

    it('list without status: the schema default status=booked is sent; pending keeps the query as given', async () => {
      const states: unknown[] = [];
      service.appointmentsState$.subscribe((s) => states.push(s));
      const [url] = await sent(service.appointmentsResult$, () => service.list({ upcoming: 'true' }), json(200, { appointments: [] }));
      expect(url).toBe(`${CONFIG.apiUrl}/calendar/appointments?upcoming=true&status=booked`);
      expect(states[1]).toEqual({ status: 'pending', query: { upcoming: 'true' } });
    });

    it('an empty list is a success', async () => {
      const [, , result] = await sent(service.appointmentsResult$, () => service.list({ upcoming: 'true' }), json(200, { appointments: [] }));
      expect(result).toEqual({ status: 'success', appointments: [] });
    });

    it('a blank note is sent as null (cleared)', async () => {
      const [, init] = await sent(service.updateNoteResult$, () => service.updateNote(ID, '   '), json(200, { ...APPOINTMENT, note: null }));
      expect(JSON.parse(init.body as string)).toEqual({ note: null });
    });

    it('a change without note sends none: the old note is kept (R-CHG-03)', async () => {
      const [, init] = await sent(service.changeResult$, () => service.change(ID, { start: START }), json(201, { cancelled: REPLACED, booked: BOOKED }));
      expect(JSON.parse(init.body as string)).toEqual({ start: START });
    });

    // What depends on the role or the calendar is the API's to answer (docs/SHARED_CALENDAR_SPEC.md
    // R-BOOK-01 to R-BOOK-03).
    it.each([
      ['a User start off the whole hour', { start: '2027-10-11T08:15:00.000Z' }],
      ['an Administrator booking without username', { start: START }],
      ['a custom end', { start: START, end: '2027-10-11T08:45:00.000Z' }],
      ['a start in the past', { start: '2020-01-01T08:00:00.000Z' }],
    ])('book: %s is sent, not refused', async (_name, booking) => {
      const [url, init] = await sent(service.bookResult$, () => service.book(booking), json(201, APPOINTMENT));
      expect(url).toBe(`${CONFIG.apiUrl}/calendar/appointments`);
      expect(JSON.parse(init.body as string)).toEqual(booking);
    });

    it('the id goes into the path encoded (a valid ULID is unchanged)', async () => {
      const [url, init] = await sent(service.cancelResult$, () => service.cancel(ID), json(200, CANCELLED));
      expect(url).toBe(`${CONFIG.apiUrl}/calendar/appointments/${ID}/cancel`);
      expect(init.body).toBeUndefined();
    });
  });
});
