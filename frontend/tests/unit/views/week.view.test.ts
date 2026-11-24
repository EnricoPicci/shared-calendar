import type { Role } from '@shared-calendar/shared';
import { BehaviorSubject } from 'rxjs';
import type { AppointmentDetail, Moving } from '../../../src/logic/appointment.detail';
import { refusalOf } from '../../../src/logic/booking';
import type { DayModel, GroupBlock, Placed, SlotBlock, WeekModel } from '../../../src/logic/week.model';
import type { WeekState } from '../../../src/logic/week.screen';
import type { BookState, CancelState, ChangeState, UpdateNoteState } from '../../../src/services/appointments.types';
import type { ListUsersState } from '../../../src/services/users.types';
import { mountWeek, type WeekDeps } from '../../../src/views/week.view';
import { find, submit, useRealPage } from './page';

// The DOM test of the week view (docs/FRONTEND_ARCHITECTURE.md section 8): the real index.html,
// and a fake WeekScreen, a fake AppointmentsService and a fake UsersService whose streams the
// test controls and whose methods are spies. The weeks and the details are written by hand:
// what the view does with them is checked here, how they are made is checked in the logic
// layer's tests.

const SCRIPT = '<script>window.hacked = true</script><b>bold</b>';
const FAILURE = 'The server cannot be reached. Check the connection and try again.';

const at = (top: string, height: string, time: string, lane = 0, lanes = 1): Placed => ({ top, height, time, lane, lanes });
const day = (date: string, label: string, over: Partial<DayModel> = {}): DayModel => ({
  date,
  label,
  today: false,
  windows: [],
  slots: [],
  busy: [],
  appointments: [],
  groups: [],
  ...over,
});

// What a slot carries for the book dialog: Monday 16 November 2026 in Rome, in a window
// 08:00–12:00 of the type Studio.
const slot = (placed: Placed, colour: number, over: Partial<SlotBlock> = {}): SlotBlock => ({
  ...placed,
  colour,
  start: '2026-11-16T07:00:00.000Z',
  end: '2026-11-16T08:00:00.000Z',
  day: 'Mon 16 Nov',
  typeName: 'Studio',
  window: { start: '2026-11-16T07:00:00.000Z', end: '2026-11-16T11:00:00.000Z' },
  places: 'free',
  full: false,
  tab: null,
  ...over,
});
const APPOINTMENT = '01M6DMQ0000000000000000001';
const OTHER_APPOINTMENT = '01M6DMQ0000000000000000002';

// A week with one of everything on Monday, and the two repeated slots side by side.
const WEEK: WeekModel = {
  timeZone: 'Europe/Rome',
  hours: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
  legend: [
    { name: 'Studio', colour: 2 },
    { name: 'Swimming Pool', colour: 5 },
  ],
  days: [
    day('2026-11-16', 'Mon 16 Nov', {
      windows: [{ ...at('0%', '40%', '08:00–12:00'), typeName: 'Studio', colour: 2 }],
      slots: [
        slot(at('0%', '10%', '08:00–09:00'), 2),
        slot(at('60%', '10%', '02:00 +02:00 – 02:00 +01:00', 0, 2), 5),
        slot(at('60%', '10%', '02:00 +01:00 – 03:00 +01:00', 1, 2), 5),
      ],
      busy: [at('10%', '10%', '09:00–10:00')],
      appointments: [{ ...at('30%', '12.5%', '11:00–12:15'), appointmentId: APPOINTMENT, who: 'You', typeName: 'Studio', note: 'First lesson', colour: 2, beside: false }],
    }),
    day('2026-11-17', 'Tue 17 Nov', { today: true }),
    ...['Wed 18 Nov', 'Thu 19 Nov', 'Fri 20 Nov', 'Sat 21 Nov', 'Sun 22 Nov'].map((label, i) => day(`2026-11-${18 + i}`, label)),
  ],
};

// Another week, with other names, to see that nothing of the first one is left.
const OTHER: WeekModel = {
  timeZone: 'Asia/Kolkata',
  hours: ['06:00', '07:00'],
  legend: [{ name: 'Piscina', colour: 1 }],
  days: [
    day('2026-11-23', 'Mon 23 Nov', {
      appointments: [{ ...at('0%', '50%', '06:00–07:00'), appointmentId: OTHER_APPOINTMENT, who: 'bob', typeName: 'Piscina', note: '', colour: 1, beside: false }],
    }),
  ],
};

const state = (over: Partial<WeekState> = {}): WeekState => ({ label: '16 Nov – 22 Nov 2026', loading: false, failure: null, week: null, moving: null, ...over });

// The details the fake WeekScreen knows, by appointment id.
const DETAIL: AppointmentDetail = {
  appointmentId: APPOINTMENT,
  when: 'Mon 16 Nov, 11:00–12:15',
  typeName: 'Studio',
  who: 'You',
  note: 'First lesson',
  noteValue: 'First lesson',
  booked: 'Booked by you on Thu 12 Nov, 13:24',
  canEditNote: true,
  canChange: true,
  canCancel: true,
  hint: 'It can be cancelled until Sun 15 Nov, 11:00.',
};

function mounted(first: WeekState = state(), role: Role = 'user', details: AppointmentDetail[] = [DETAIL]) {
  const week$ = new BehaviorSubject<WeekState>(first);
  const bookState$ = new BehaviorSubject<BookState>({ status: 'idle' });
  const cancelState$ = new BehaviorSubject<CancelState>({ status: 'idle' });
  const changeState$ = new BehaviorSubject<ChangeState>({ status: 'idle' });
  const updateNoteState$ = new BehaviorSubject<UpdateNoteState>({ status: 'idle' });
  const listUsersState$ = new BehaviorSubject<ListUsersState>({ status: 'idle' });
  const screen = {
    week$: week$.asObservable(),
    previous: vi.fn<WeekDeps['screen']['previous']>(),
    next: vi.fn<WeekDeps['screen']['next']>(),
    today: vi.fn<WeekDeps['screen']['today']>(),
    detail: vi.fn<WeekDeps['screen']['detail']>((id) => details.find((detail) => detail.appointmentId === id) ?? null),
    move: vi.fn<WeekDeps['screen']['move']>(),
    keep: vi.fn<WeekDeps['screen']['keep']>(),
    // The words of a refusal as the logic layer chooses them, with no appointment of the week to
    // name: a test that needs one answers it itself.
    refusal: vi.fn<WeekDeps['screen']['refusal']>((reason, asked) => refusalOf(reason, asked, role, [])),
  };
  const appointments = {
    bookState$: bookState$.asObservable(),
    cancelState$: cancelState$.asObservable(),
    book: vi.fn<WeekDeps['appointments']['book']>(),
    cancel: vi.fn<WeekDeps['appointments']['cancel']>(),
    changeState$: changeState$.asObservable(),
    updateNoteState$: updateNoteState$.asObservable(),
    change: vi.fn<WeekDeps['appointments']['change']>(),
    updateNote: vi.fn<WeekDeps['appointments']['updateNote']>(),
  };
  const users = { listUsersState$: listUsersState$.asObservable(), listUsers: vi.fn<WeekDeps['users']['listUsers']>() };
  const root = find('#week');
  const subscription = mountWeek(root, { screen, appointments, users, role });
  return { week$, bookState$, cancelState$, changeState$, updateNoteState$, listUsersState$, screen, appointments, users, root, subscription };
}

const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(`#week ${selector}`)];
const texts = (selector: string) => all(selector).map((element) => element.textContent);
const html = () => document.documentElement.outerHTML;

// Test names: section numbers and R-… rules are those of docs/SHARED_CALENDAR_SPEC.md.
describe('mountWeek', () => {
  useRealPage();

  describe('the states of week$', () => {
    it('nothing yet: the label, no "Loading…", no failure, no time zone, no week', () => {
      mounted();
      expect(find('#week .week-label').textContent).toBe('16 Nov – 22 Nov 2026');
      expect(find('#week .loading').hidden).toBe(true);
      expect(find('#week .failure').hidden).toBe(true);
      expect(find('#week .zone').hidden).toBe(true);
      expect(find('#week .week').classList.contains('stale')).toBe(false);
      expect(all('.day, .hours li, .legend li')).toHaveLength(0);
    });

    it('loading without a week: "Loading…" is shown and the week dimmed', () => {
      mounted(state({ loading: true }));
      expect(find('#week .loading').hidden).toBe(false);
      expect(find('#week .loading').textContent).toBe('Loading…');
      expect(find('#week .week').classList.contains('stale')).toBe(true);
      expect(all('.day')).toHaveLength(0);
    });

    it('a week: the time zone in a sentence, the legend, the hours, the seven days', () => {
      mounted(state({ week: WEEK }));
      expect(find('#week .zone').hidden).toBe(false);
      expect(find('#week .zone').textContent).toBe("Times are in the calendar's time zone, Europe/Rome.");
      expect(texts('.legend li')).toEqual(['Studio', 'Swimming Pool']);
      expect(all('.legend li').map((li) => li.className)).toEqual(['type-2', 'type-5']);
      expect(texts('.hours li')).toEqual(WEEK.hours);
      expect(texts('.day h3')).toEqual(['Mon 16 Nov', 'Tue 17 Nov', 'Wed 18 Nov', 'Thu 19 Nov', 'Fri 20 Nov', 'Sat 21 Nov', 'Sun 22 Nov']);
      expect(all('.day').map((d) => d.classList.contains('today'))).toEqual([false, true, false, false, false, false, false]);
      expect(find('#week .loading').hidden).toBe(true);
      expect(find('#week .week').classList.contains('stale')).toBe(false);
    });

    it('a slot and an appointment are named, for a screen reader, with their day before their own words; a text with markup in a name stays text', () => {
      mounted(state({ week: WEEK }));
      const names = (selector: string) => all(selector).map((button) => button.getAttribute('aria-label'));
      expect(names('.slot')).toEqual(['Mon 16 Nov 08:00–09:00 free', 'Mon 16 Nov 02:00 +02:00 – 02:00 +01:00 free', 'Mon 16 Nov 02:00 +01:00 – 03:00 +01:00 free']);
      expect(names('.appointment')).toEqual(['Mon 16 Nov 11:00–12:15 You First lesson']);
      // What cannot be pressed has no name of its own.
      expect(names('.window, .busy')).toEqual([null, null]);
    });

    it('a week: the blocks of a day, each with its texts and its type\'s colour', () => {
      mounted(state({ week: WEEK }));
      const monday = all('.day')[0]!;
      const one = (selector: string) => monday.querySelector<HTMLElement>(selector)!;
      expect(one('.window').textContent).toBe('Studio');
      expect(one('.window').classList.contains('type-2')).toBe(true);
      expect(one('.busy').textContent).toBe('09:00–10:00 busy');
      expect(one('.busy').className).not.toContain('type-');
      expect(one('.slot').textContent).toBe('08:00–09:00 free');
      expect(one('.slot').classList.contains('type-2')).toBe(true);
      expect(one('.appointment .time').textContent).toBe('11:00–12:15');
      expect(one('.appointment .who').textContent).toBe('You');
      expect(one('.appointment .note').textContent).toBe('First lesson');
      expect(one('.appointment').classList.contains('type-2')).toBe(true);
      expect(all('.day')[1]!.querySelectorAll('.block')).toHaveLength(0);
    });

    it('loading with a week: the week stays, dimmed, under the new label', () => {
      const { week$ } = mounted(state({ week: WEEK }));
      week$.next(state({ label: '23 Nov – 29 Nov 2026', loading: true, week: WEEK }));
      expect(find('#week .week-label').textContent).toBe('23 Nov – 29 Nov 2026');
      expect(find('#week .loading').hidden).toBe(false);
      expect(find('#week .week').classList.contains('stale')).toBe(true);
      expect(texts('.day h3')[0]).toBe('Mon 16 Nov');
    });

    it('a failure without a week: the sentence, announced, and no week', () => {
      mounted(state({ failure: FAILURE }));
      const failure = find('#week .failure');
      expect(failure.hidden).toBe(false);
      expect(failure.textContent).toBe(FAILURE);
      expect(failure.getAttribute('role')).toBe('alert');
      expect(all('.day')).toHaveLength(0);
    });

    it('a failure with a week: the sentence, and the last week still on screen', () => {
      const { week$ } = mounted(state({ week: WEEK }));
      week$.next(state({ failure: FAILURE, week: WEEK }));
      expect(find('#week .failure').textContent).toBe(FAILURE);
      expect(all('.day')).toHaveLength(7);
      expect(find('#week .week').classList.contains('stale')).toBe(false);
    });

    it('a success after a failure removes the sentence', () => {
      const { week$ } = mounted(state({ failure: FAILURE }));
      week$.next(state({ week: WEEK }));
      expect(find('#week .failure').hidden).toBe(true);
      expect(find('#week .failure').textContent).toBe('');
    });
  });

  describe('the user\'s actions', () => {
    it.each([
      ['.previous', 'previous'],
      ['.today', 'today'],
      ['.next', 'next'],
    ] as const)('a click on %s calls %s(), once, and nothing else', (selector, method) => {
      const { screen } = mounted(state({ week: WEEK }));
      find(`#week ${selector}`).click();
      const calls = { previous: screen.previous.mock.calls.length, today: screen.today.mock.calls.length, next: screen.next.mock.calls.length };
      expect(calls).toEqual({ previous: 0, today: 0, next: 0, [method]: 1 });
    });

    it('a click changes nothing on screen by itself: the label and the week wait for the stream', () => {
      mounted(state({ week: WEEK }));
      const before = find('#week').textContent;
      find('#week .next').click();
      expect(find('#week').textContent).toBe(before);
      expect(find('#week .loading').hidden).toBe(true);
    });

    it('slots and appointments are buttons a keyboard reaches, named by their text; windows and busy blocks are plain elements', () => {
      mounted(state({ week: WEEK }));
      for (const block of all('.slot, .appointment')) {
        expect(block.tagName).toBe('BUTTON');
        expect(block.getAttribute('type')).toBe('button');
        expect(block.hasAttribute('tabindex')).toBe(false);
      }
      expect(find('#week .slot').textContent).toBe('08:00–09:00 free');
      expect(find('#week .appointment').textContent).toBe('11:00–12:15 You First lesson');
      for (const block of all('.window, .busy')) {
        expect(block.tagName).toBe('DIV');
        expect(block.onclick).toBeNull();
      }
      expect(all('.days a')).toHaveLength(0);
    });
  });

  describe('positions and lanes', () => {
    it('top and height are set as the logic layer gives them', () => {
      mounted(state({ week: WEEK }));
      const places = (selector: string) => all(selector).map((element) => [element.style.top, element.style.height]);
      expect(places('.window')).toEqual([['0%', '40%']]);
      expect(places('.busy')).toEqual([['10%', '10%']]);
      expect(places('.slot')).toEqual([
        ['0%', '10%'],
        ['60%', '10%'],
        ['60%', '10%'],
      ]);
      expect(places('.appointment')).toEqual([['30%', '12.5%']]);
    });

    it('every day knows how many hours are shown', () => {
      mounted(state({ week: WEEK }));
      expect(all('.day-body').map((body) => body.style.getPropertyValue('--hours'))).toEqual(Array(7).fill('10'));
    });

    it('two blocks in the same place go side by side by their lane; the others have the whole width', () => {
      mounted(state({ week: WEEK }));
      const lanes = (selector: string) => all(selector).map((element) => [...element.classList].filter((name) => name.startsWith('lane-')));
      expect(lanes('.slot')).toEqual([['lane-0-of-1'], ['lane-0-of-2'], ['lane-1-of-2']]);
      expect(texts('.slot .time').slice(1)).toEqual(['02:00 +02:00 – 02:00 +01:00', '02:00 +01:00 – 03:00 +01:00']);
      expect(lanes('.window, .busy, .appointment')).toEqual([['lane-0-of-1'], ['lane-0-of-1'], ['lane-0-of-1']]);
    });
  });

  it('a type name, a username and a note containing <script> are shown as text', () => {
    const week: WeekModel = {
      ...WEEK,
      timeZone: SCRIPT,
      legend: [{ name: SCRIPT, colour: 0 }],
      days: [
        day('2026-11-16', SCRIPT, {
          windows: [{ ...at('0%', '10%', SCRIPT), typeName: SCRIPT, colour: 0 }],
          slots: [slot(at('0%', '10%', SCRIPT), 0)],
          busy: [at('0%', '10%', SCRIPT)],
          appointments: [{ ...at('0%', '10%', SCRIPT), appointmentId: APPOINTMENT, who: SCRIPT, typeName: SCRIPT, note: SCRIPT, colour: 0, beside: false }],
        }),
      ],
    };
    mounted(state({ label: SCRIPT, failure: SCRIPT, week }));
    for (const selector of ['.week-label', '.failure', '.zone-name', '.legend li', '.day h3', '.window .type-name', '.slot .time', '.busy .time', '.appointment .time', '.appointment .who', '.appointment .note']) {
      const element = find(`#week ${selector}`);
      expect(element.textContent, selector).toBe(SCRIPT);
      expect(element.children, selector).toHaveLength(0);
    }
    expect(document.querySelectorAll('script, b')).toHaveLength(0);
  });

  describe('redrawing', () => {
    it('a second week replaces the first, with nothing left of it', () => {
      const { week$ } = mounted(state({ week: WEEK }));
      week$.next(state({ label: '23 Nov – 29 Nov 2026', week: OTHER }));
      expect(texts('.day h3')).toEqual(['Mon 23 Nov']);
      expect(texts('.hours li')).toEqual(['06:00', '07:00']);
      expect(texts('.legend li')).toEqual(['Piscina']);
      expect(find('#week .zone-name').textContent).toBe('Asia/Kolkata');
      expect(texts('.appointment .who')).toEqual(['bob']);
      expect(all('.window, .slot, .busy')).toHaveLength(0);
      const page = find('#week').textContent;
      for (const gone of ['Studio', 'Swimming Pool', 'First lesson', 'You', '16 Nov', 'Europe/Rome']) expect(page).not.toContain(gone);
    });

    it('the days are rebuilt only when the week is another object, not at every notification', () => {
      const { week$ } = mounted(state({ week: WEEK }));
      const first = all('.day');
      week$.next(state({ label: '23 Nov – 29 Nov 2026', loading: true, week: WEEK }));
      week$.next(state({ label: '23 Nov – 29 Nov 2026', failure: FAILURE, week: WEEK }));
      expect(all('.day')).toEqual(first);
      expect(all('.day')[0]).toBe(first[0]);

      week$.next(state({ week: { ...WEEK } }));
      expect(all('.day')[0]).not.toBe(first[0]);
    });
  });

  // The two dialogs of the week and what is in them.
  const book = () => find<HTMLDialogElement>('#week dialog.book');
  const bookForm = () => find<HTMLFormElement>('#week dialog.book form');
  const note = () => find<HTMLTextAreaElement>('#week dialog.book [name="note"]');
  const bookError = () => find('#week dialog.book .error');
  const bookSubmit = () => find<HTMLButtonElement>('#week dialog.book .submit');
  const select = (name: string) => find<HTMLSelectElement>(`#week dialog.book [name="${name}"]`);
  const options = (name: string) => [...select(name).options].map((option) => option.value);
  const usersMessage = () => find('#week dialog.book .users-message');
  const detail = () => find<HTMLDialogElement>('dialog.detail');
  const detailError = () => find('dialog.detail .error');
  const cancelButton = () => find<HTMLButtonElement>('dialog.detail .cancel');
  const detailText = (field: string) => find(`dialog.detail .${field}`).textContent;

  const ALICE_AND_BOB: ListUsersState = {
    status: 'success',
    users: [
      { username: 'alice', createdAt: '2026-11-01T10:00:00.000Z' },
      { username: 'bob', createdAt: '2026-11-02T10:00:00.000Z' },
    ],
  };
  const TAKEN = 'This time is full: there is no place left. The calendar has been refreshed: please choose another time.';
  const booked = (): BookState => ({ status: 'success', appointment: {} as never });

  describe('the book dialog, for a User', () => {
    it('before any click both dialogs are closed', () => {
      mounted(state({ week: WEEK }));
      expect([book().open, detail().open]).toEqual([false, false]);
    });

    it('a click on a free slot opens it: what is booked in words, an empty note, no failure, "Book" enabled', () => {
      const { appointments } = mounted(state({ week: WEEK }));
      find('#week .slot').click();
      expect(book().open).toBe(true);
      expect(detail().open).toBe(false);
      expect(find('#week dialog.book .what').textContent).toBe('Mon 16 Nov, 08:00–09:00 · Studio');
      expect(note().value).toBe('');
      expect(note().maxLength).toBe(500);
      expect(bookError().textContent).toBe('');
      expect(bookError().getAttribute('role')).toBe('alert');
      expect(bookSubmit().disabled).toBe(false);
      expect(appointments.book).not.toHaveBeenCalled();
    });

    it('the User picker and the custom times are hidden, and the list of users is never asked for', () => {
      const { users } = mounted(state({ week: WEEK }));
      find('#week .slot').click();
      expect(find('#week dialog.book .choices').hidden).toBe(true);
      expect([options('username'), options('start'), options('end')]).toEqual([[], [], []]);
      expect(users.listUsers).not.toHaveBeenCalled();
    });

    it('"Book" calls book() with the slot\'s start and the note, once, and changes nothing on screen by itself', () => {
      const { appointments } = mounted(state({ week: WEEK }));
      find('#week .slot').click();
      note().value = '  First lesson ';
      const { prevented } = submit(bookForm());
      expect(prevented).toBe(true);
      expect(appointments.book).toHaveBeenCalledTimes(1);
      expect(appointments.book).toHaveBeenCalledWith({ start: '2026-11-16T07:00:00.000Z', note: 'First lesson' });
      // The outcome comes from the stream: the dialog is still open, the button still enabled.
      expect(book().open).toBe(true);
      expect(bookSubmit().disabled).toBe(false);
      expect(note().value).toBe('  First lesson ');
    });

    it('without a note only the start is sent', () => {
      const { appointments } = mounted(state({ week: WEEK }));
      find('#week .slot').click();
      submit(bookForm());
      expect(appointments.book).toHaveBeenCalledWith({ start: '2026-11-16T07:00:00.000Z' });
    });

    it('each slot books its own instant: the second of the two repeated slots', () => {
      const repeated = { ...WEEK, days: [day('2027-10-31', 'Sun 31 Oct', { slots: [
        slot(at('0%', '10%', '02:00 +02:00 – 02:00 +01:00', 0, 2), 5, { start: '2027-10-31T00:00:00.000Z', end: '2027-10-31T01:00:00.000Z', day: 'Sun 31 Oct' }),
        slot(at('0%', '10%', '02:00 +01:00 – 03:00 +01:00', 1, 2), 5, { start: '2027-10-31T01:00:00.000Z', end: '2027-10-31T02:00:00.000Z', day: 'Sun 31 Oct' }),
      ] })] };
      const { appointments } = mounted(state({ week: repeated }));
      all('.slot')[1]!.click();
      expect(find('#week dialog.book .what').textContent).toBe('Sun 31 Oct, 02:00 +01:00 – 03:00 +01:00 · Studio');
      submit(bookForm());
      expect(appointments.book).toHaveBeenCalledWith({ start: '2027-10-31T01:00:00.000Z' });
    });

    it('bookState$ pending: "Book" is disabled; the dialog and the note stay', () => {
      const { bookState$ } = mounted(state({ week: WEEK }));
      find('#week .slot').click();
      note().value = 'First lesson';
      submit(bookForm());
      bookState$.next({ status: 'pending', booking: { start: '2026-11-16T07:00:00.000Z', note: 'First lesson' } });
      expect(bookSubmit().disabled).toBe(true);
      expect(book().open).toBe(true);
      expect(note().value).toBe('First lesson');
      expect(bookError().textContent).toBe('');
    });

    it('bookState$ success: the dialog closes', () => {
      const { bookState$ } = mounted(state({ week: WEEK }));
      find('#week .slot').click();
      submit(bookForm());
      bookState$.next({ status: 'pending', booking: { start: '2026-11-16T07:00:00.000Z' } });
      bookState$.next(booked());
      expect(book().open).toBe(false);
      expect(bookSubmit().disabled).toBe(false);
    });

    it('bookState$ failure: the sentence in plain words, the dialog still open with what was typed, "Book" usable again', () => {
      const { bookState$ } = mounted(state({ week: WEEK }));
      find('#week .slot').click();
      note().value = 'First lesson';
      submit(bookForm());
      bookState$.next({ status: 'pending', booking: { start: '2026-11-16T07:00:00.000Z', note: 'First lesson' } });
      bookState$.next({ status: 'failure', reason: 'slot_taken', message: 'slot_taken: the slot overlaps appointment 01M6…' });
      expect(bookError().textContent).toBe(TAKEN);
      expect(book().open).toBe(true);
      expect(note().value).toBe('First lesson');
      expect(bookSubmit().disabled).toBe(false);
      expect(find('#week').textContent).not.toContain('overlaps');
    });

    it('a second try after a failure: the sentence goes while it is pending, and a success closes', () => {
      const { bookState$, appointments } = mounted(state({ week: WEEK }));
      find('#week .slot').click();
      submit(bookForm());
      bookState$.next({ status: 'failure', reason: 'network', message: 'TypeError: Failed to fetch' });
      expect(bookError().textContent).toBe(FAILURE);
      submit(bookForm());
      expect(appointments.book).toHaveBeenCalledTimes(2);
      bookState$.next({ status: 'pending', booking: { start: '2026-11-16T07:00:00.000Z' } });
      expect(bookError().textContent).toBe('');
      bookState$.next(booked());
      expect(book().open).toBe(false);
    });

    it('"Close" closes it without a call', () => {
      const { appointments } = mounted(state({ week: WEEK }));
      find('#week .slot').click();
      find('#week dialog.book .close').click();
      expect(book().open).toBe(false);
      expect(appointments.book).not.toHaveBeenCalled();
    });
  });

  describe('the book dialog opened a second time shows nothing of the first', () => {
    it('a close event that arrives late, after the dialog was opened again, changes nothing: the slot is still the one booked, and a success closes the dialog', () => {
      const { appointments, bookState$ } = mounted(state({ week: WEEK }));
      find('#week .slot').click();
      book().close(); // the Escape key
      find('#week .slot').click(); // opened again at once
      // A browser sends the close event a moment after the close: here, after the new opening.
      book().dispatchEvent(new Event('close'));
      submit(bookForm());
      expect(appointments.book).toHaveBeenCalledWith({ start: '2026-11-16T07:00:00.000Z' });
      book().dispatchEvent(new Event('close'));
      bookState$.next(booked());
      expect(book().open).toBe(false);
    });

    it('for the Administrator the same late close event leaves the list of users to the open dialog', () => {
      const { listUsersState$ } = mounted(state({ week: WEEK }), 'admin');
      find('#week .slot').click();
      book().close();
      find('#week .slot').click();
      book().dispatchEvent(new Event('close'));
      listUsersState$.next({ status: 'pending' });
      expect(usersMessage().textContent).toBe('Loading the users…');
      listUsersState$.next(ALICE_AND_BOB);
      expect(options('username')).toEqual(['alice', 'bob']);
      expect(bookSubmit().disabled).toBe(false);
    });

    it('after a success: an empty note, no failure', () => {
      const { bookState$ } = mounted(state({ week: WEEK }));
      find('#week .slot').click();
      note().value = 'First lesson';
      submit(bookForm());
      bookState$.next(booked());
      expect(book().open).toBe(false);

      all('.slot')[1]!.click();
      expect(book().open).toBe(true);
      expect(note().value).toBe('');
      expect(bookError().textContent).toBe('');
      expect(find('#week dialog.book .what').textContent).toBe('Mon 16 Nov, 02:00 +02:00 – 02:00 +01:00 · Studio');
    });

    it('after a failure and the Escape key (close()): an empty note, no failure, "Book" enabled', () => {
      const { bookState$ } = mounted(state({ week: WEEK }));
      find('#week .slot').click();
      note().value = 'First lesson';
      submit(bookForm());
      bookState$.next({ status: 'failure', reason: 'slot_taken', message: 'taken' });
      book().close();

      find('#week .slot').click();
      expect(note().value).toBe('');
      expect(bookError().textContent).toBe('');
      expect(bookSubmit().disabled).toBe(false);
    });

    it('a failure that was already in the stream when the view was mounted is not shown at opening', () => {
      const { bookState$, subscription } = mounted(state({ week: WEEK }));
      bookState$.next({ status: 'failure', reason: 'slot_taken', message: 'taken' });
      expect(bookError().textContent).toBe('');
      find('#week .slot').click();
      expect(bookError().textContent).toBe('');
      subscription.unsubscribe();
    });

    it('a booking still under way from an opening that was closed: "Book" is disabled, and its result is neither shown nor closes the new dialog', () => {
      const { bookState$ } = mounted(state({ week: WEEK }));
      find('#week .slot').click();
      submit(bookForm());
      bookState$.next({ status: 'pending', booking: { start: '2026-11-16T07:00:00.000Z' } });
      book().close();

      all('.slot')[1]!.click();
      expect(bookSubmit().disabled).toBe(true);
      bookState$.next({ status: 'failure', reason: 'slot_taken', message: 'taken' });
      expect(bookError().textContent).toBe('');
      expect(bookSubmit().disabled).toBe(false);

      book().close();
      find('#week .slot').click();
      bookState$.next(booked());
      expect(book().open).toBe(true);
    });
  });

  describe('the book dialog, for the Administrator', () => {
    const opened = () => {
      const view = mounted(state({ week: WEEK }), 'admin');
      find('#week .slot').click();
      return view;
    };

    it('shows the User picker and the times, and asks for the list of users at every opening', () => {
      const { users } = opened();
      expect(find('#week dialog.book .choices').hidden).toBe(false);
      expect(users.listUsers).toHaveBeenCalledTimes(1);
      book().close();
      find('#week .slot').click();
      expect(users.listUsers).toHaveBeenCalledTimes(2);
    });

    it('the times are every quarter of the slot\'s window, set to the slot\'s own', () => {
      opened();
      expect(options('start')).toHaveLength(16);
      expect([options('start')[0], options('start').at(-1)]).toEqual(['08:00', '11:45']);
      expect([options('end')[0], options('end').at(-1)]).toEqual(['08:15', '12:00']);
      expect([select('start').value, select('end').value]).toEqual(['08:00', '09:00']);
    });

    it('before the list arrives and while it loads: no choice, "Book" disabled, and loading says so', () => {
      const { listUsersState$ } = opened();
      expect(bookSubmit().disabled).toBe(true);
      expect(options('username')).toEqual([]);
      listUsersState$.next({ status: 'pending' });
      expect(usersMessage().textContent).toBe('Loading the users…');
      expect(bookSubmit().disabled).toBe(true);
    });

    it('the list loaded: one choice per User, "Book" enabled, no message', () => {
      const { listUsersState$ } = opened();
      listUsersState$.next({ status: 'pending' });
      listUsersState$.next(ALICE_AND_BOB);
      expect(options('username')).toEqual(['alice', 'bob']);
      expect(select('username').value).toBe('alice');
      expect(usersMessage().textContent).toBe('');
      expect(bookSubmit().disabled).toBe(false);
    });

    it('an empty list says that there is no User to book for, and "Book" stays disabled', () => {
      const { listUsersState$ } = opened();
      listUsersState$.next({ status: 'success', users: [] });
      expect(usersMessage().textContent).toBe('There is no User to book for.');
      expect(options('username')).toEqual([]);
      expect(bookSubmit().disabled).toBe(true);
    });

    it('a failed list is said in plain words in the dialog, and "Book" stays disabled', () => {
      const { listUsersState$ } = opened();
      listUsersState$.next({ status: 'failure', reason: 'network', message: 'TypeError: Failed to fetch' });
      expect(usersMessage().textContent).toBe(FAILURE);
      expect(bookSubmit().disabled).toBe(true);
      expect(find('#week').textContent).not.toContain('TypeError');
    });

    it('a list that arrives while the dialog is closed is left alone; the next opening starts without choices', () => {
      const { listUsersState$ } = opened();
      book().close();
      listUsersState$.next(ALICE_AND_BOB);
      expect(options('username')).toEqual([]);

      find('#week .slot').click();
      expect(bookSubmit().disabled).toBe(true);
      listUsersState$.next({ status: 'pending' });
      listUsersState$.next({ status: 'success', users: [{ username: 'carol', createdAt: '2026-11-03T10:00:00.000Z' }] });
      expect(options('username')).toEqual(['carol']);
    });

    it('"Book" with the times not touched: the User chosen, the slot\'s own start and end, the note', () => {
      const { listUsersState$, appointments } = opened();
      listUsersState$.next(ALICE_AND_BOB);
      select('username').value = 'bob';
      note().value = 'For Bob';
      submit(bookForm());
      expect(appointments.book).toHaveBeenCalledWith({ start: '2026-11-16T07:00:00.000Z', end: '2026-11-16T08:00:00.000Z', username: 'bob', note: 'For Bob' });
    });

    it('"Book" with a custom start and end: the two times of the slot\'s day in the calendar\'s zone', () => {
      const { listUsersState$, appointments } = opened();
      listUsersState$.next(ALICE_AND_BOB);
      select('start').value = '10:15';
      select('end').value = '10:45';
      submit(bookForm());
      expect(appointments.book).toHaveBeenCalledWith({ start: '2026-11-16T09:15:00.000Z', end: '2026-11-16T09:45:00.000Z', username: 'alice' });
    });

    it('an end not after the start goes to the service, whose refusal is shown in plain words with the dialog open', () => {
      const { listUsersState$, bookState$, appointments } = opened();
      listUsersState$.next(ALICE_AND_BOB);
      select('start').value = '11:00';
      select('end').value = '10:00';
      submit(bookForm());
      expect(appointments.book).toHaveBeenCalledWith({ start: '2026-11-16T10:00:00.000Z', end: '2026-11-16T09:00:00.000Z', username: 'alice' });
      bookState$.next({ status: 'pending', booking: appointments.book.mock.lastCall![0] });
      bookState$.next({ status: 'failure', reason: 'invalid_request', message: 'end: end must be after start' });
      expect(bookError().textContent).toBe('The request was not accepted. Check what you entered and try again.');
      expect(book().open).toBe(true);
      expect([select('start').value, select('end').value]).toEqual(['11:00', '10:00']);
    });

    it('a booking under way and a list still loading both keep "Book" disabled', () => {
      const { listUsersState$, bookState$ } = opened();
      bookState$.next({ status: 'pending', booking: { start: '2026-11-16T07:00:00.000Z' } });
      listUsersState$.next(ALICE_AND_BOB);
      expect(bookSubmit().disabled).toBe(true);
      bookState$.next({ status: 'failure', reason: 'network', message: 'x' });
      expect(bookSubmit().disabled).toBe(false);
    });

    it('opened a second time: the times are the new slot\'s own, the note is empty, the User is the first again', () => {
      const { listUsersState$ } = opened();
      listUsersState$.next(ALICE_AND_BOB);
      select('username').value = 'bob';
      select('start').value = '10:15';
      note().value = 'For Bob';
      book().close();

      find('#week .slot').click();
      expect([select('start').value, select('end').value]).toEqual(['08:00', '09:00']);
      expect(note().value).toBe('');
      listUsersState$.next(ALICE_AND_BOB);
      expect(select('username').value).toBe('alice');
    });
  });

  // The appointment detail is the frame's dialog, mounted by this view while the week is on
  // show: what the dialog itself does is in detail.view.test.ts, for the week and for the list.
  // Here, what is the week's: which appointment it opens, and whose answers and calls it uses.
  describe('the appointment detail, opened from the week', () => {
    it('a click on an appointment asks the week screen for its detail and opens the dialog with it', () => {
      const { screen } = mounted(state({ week: WEEK }));
      find('#week .appointment').click();
      expect(screen.detail).toHaveBeenCalledWith(APPOINTMENT);
      expect(detail().open).toBe(true);
      expect(book().open).toBe(false);
      expect(detail().closest('#week')).toBeNull(); // the frame's dialog, not the week's
      expect(['when', 'typeName', 'who', 'note', 'booked', 'hint'].map(detailText)).toEqual([
        'Mon 16 Nov, 11:00–12:15',
        'Studio',
        'You',
        'First lesson',
        'Booked by you on Thu 12 Nov, 13:24',
        'It can be cancelled until Sun 15 Nov, 11:00.',
      ]);
    });

    it('an appointment the week on screen no longer holds opens nothing', () => {
      const { screen } = mounted(state({ week: WEEK }), 'user', []);
      find('#week .appointment').click();
      expect(screen.detail).toHaveBeenCalledTimes(1);
      expect(detail().open).toBe(false);
    });

    it('"Cancel appointment" and "Save note" call the service the week view was given', () => {
      const { appointments } = mounted(state({ week: WEEK }));
      find('#week .appointment').click();
      cancelButton().click();
      expect(appointments.cancel).toHaveBeenCalledWith(APPOINTMENT);
      noteField().value = 'Second lesson';
      submit(noteForm());
      expect(appointments.updateNote).toHaveBeenCalledWith(APPOINTMENT, 'Second lesson');
    });
  });

  it('a note and a username containing <script> are shown as text in both dialogs', () => {
    const week: WeekModel = { ...WEEK, days: [day('2026-11-16', 'Mon 16 Nov', {
      slots: [slot(at('0%', '10%', SCRIPT), 0, { day: SCRIPT, typeName: SCRIPT })],
      appointments: [{ ...at('0%', '10%', '11:00–12:15'), appointmentId: APPOINTMENT, who: SCRIPT, typeName: SCRIPT, note: SCRIPT, colour: 0, beside: false }],
    })] };
    const scripted: AppointmentDetail = { ...DETAIL, when: SCRIPT, typeName: SCRIPT, who: SCRIPT, note: SCRIPT, booked: SCRIPT, hint: SCRIPT };
    const { listUsersState$ } = mounted(state({ week }), 'admin', [scripted]);

    find('#week .slot').click();
    listUsersState$.next({ status: 'success', users: [{ username: SCRIPT, createdAt: '2026-11-01T10:00:00.000Z' }] });
    expect(find('#week dialog.book .what').textContent).toBe(`${SCRIPT}, ${SCRIPT} · ${SCRIPT}`);
    expect(find('#week dialog.book .what').children).toHaveLength(0);
    expect(select('username').options[0]!.textContent).toBe(SCRIPT);
    expect(select('username').options[0]!.children).toHaveLength(0);
    book().close();

    find('#week .appointment').click();
    for (const field of ['when', 'typeName', 'who', 'note', 'booked', 'hint']) {
      const element = find(`dialog.detail .${field}`);
      expect(element.textContent, field).toBe(SCRIPT);
      expect(element.children, field).toHaveLength(0);
    }
    expect(document.querySelectorAll('script, b')).toHaveLength(0);
  });

  describe('a reload while a dialog is open', () => {
    it('redraws the days behind the book dialog and leaves the dialog, what was typed and its failure as they are', () => {
      const { week$, bookState$, appointments } = mounted(state({ week: WEEK }));
      find('#week .slot').click();
      note().value = 'First lesson';
      submit(bookForm());
      bookState$.next({ status: 'failure', reason: 'slot_taken', message: 'taken' });
      const before = all('.day')[0];

      week$.next(state({ loading: true, week: WEEK }));
      week$.next(state({ week: OTHER }));
      expect(all('.day')[0]).not.toBe(before);
      expect(all('.slot')).toHaveLength(0); // the slot is gone from the week behind
      expect(book().open).toBe(true);
      expect(note().value).toBe('First lesson');
      expect(bookError().textContent).toBe(TAKEN);
      expect(find('#week dialog.book .what').textContent).toBe('Mon 16 Nov, 08:00–09:00 · Studio');

      // And the dialog still books the slot it was opened for.
      submit(bookForm());
      expect(appointments.book).toHaveBeenLastCalledWith({ start: '2026-11-16T07:00:00.000Z', note: 'First lesson' });
    });

    it('redraws the days behind the detail and leaves it as it is', () => {
      const { week$, appointments } = mounted(state({ week: WEEK }));
      find('#week .appointment').click();
      week$.next(state({ week: OTHER }));
      expect(texts('.day h3')).toEqual(['Mon 23 Nov']);
      expect(detail().open).toBe(true);
      expect(detailText('note')).toBe('First lesson');
      cancelButton().click();
      expect(appointments.cancel).toHaveBeenCalledWith(APPOINTMENT);
    });
  });

  describe('leaving the view', () => {
    it('after unsubscribing nothing is left in the page, which is as index.html has it', () => {
      const before = html();
      const { subscription } = mounted(state({ loading: true, failure: FAILURE, week: WEEK }));
      expect(html()).not.toBe(before);

      subscription.unsubscribe();
      expect(all('.day, .hours li, .legend li, .block')).toHaveLength(0);
      expect(find('#week .week-label').textContent).toBe('');
      expect(find('#week .zone-name').textContent).toBe('');
      expect(find('#week .failure').textContent).toBe('');
      expect([find('#week .loading').hidden, find('#week .failure').hidden, find('#week .zone').hidden]).toEqual([true, true, true]);
      expect(find('#week .week').classList.contains('stale')).toBe(false);
      expect(html()).toBe(before);
    });

    it('with the book dialog open and filled, as the Administrator: closed, emptied, and the page as index.html has it', () => {
      const before = html();
      const { subscription, listUsersState$, bookState$ } = mounted(state({ week: WEEK }), 'admin');
      find('#week .slot').click();
      listUsersState$.next({ status: 'success', users: [{ username: 'alice', createdAt: '2026-11-01T10:00:00.000Z' }] });
      note().value = 'A private note';
      submit(bookForm());
      bookState$.next({ status: 'failure', reason: 'slot_taken', message: 'taken' });
      expect(book().open).toBe(true);

      subscription.unsubscribe();
      expect(book().open).toBe(false);
      expect(note().value).toBe('');
      expect(all('dialog.book option')).toHaveLength(0);
      expect(find('#week dialog.book').textContent).not.toContain('Mon 16 Nov');
      expect(bookError().textContent).toBe('');
      expect(find('#week dialog.book .choices').hidden).toBe(true);
      expect(html()).not.toContain('alice');
      expect(html()).toBe(before);
    });

    it('with the detail open after a failed cancellation: closed, emptied, and the page as index.html has it', () => {
      const before = html();
      const { subscription, cancelState$ } = mounted(state({ week: WEEK }));
      find('#week .appointment').click();
      cancelButton().click();
      cancelState$.next({ status: 'pending', appointmentId: APPOINTMENT });
      expect(cancelButton().disabled).toBe(true);
      cancelState$.next({ status: 'failure', reason: 'network', message: 'TypeError: Failed to fetch' });
      expect(detail().open).toBe(true);

      subscription.unsubscribe();
      expect(detail().open).toBe(false);
      expect(find('dialog.detail').textContent).not.toContain('First lesson');
      expect(cancelButton().hidden).toBe(true);
      expect(html()).not.toContain('First lesson');
      expect(html()).toBe(before);
    });

    it('left while a booking and a cancellation are under way, neither button is left disabled', () => {
      const before = html();
      const { subscription, bookState$, cancelState$ } = mounted(state({ week: WEEK }));
      find('#week .appointment').click();
      cancelButton().click();
      cancelState$.next({ status: 'pending', appointmentId: APPOINTMENT });
      detail().close();
      find('#week .slot').click();
      submit(bookForm());
      bookState$.next({ status: 'pending', booking: { start: '2026-11-16T07:00:00.000Z' } });
      expect(bookSubmit().disabled).toBe(true);
      subscription.unsubscribe();
      expect([bookSubmit().disabled, cancelButton().disabled]).toEqual([false, false]);
      expect(html()).toBe(before);
    });

    it('the streams are no longer heard', () => {
      const { week$, bookState$, cancelState$, listUsersState$, subscription } = mounted();
      subscription.unsubscribe();
      expect([week$.observed, bookState$.observed, cancelState$.observed, listUsersState$.observed]).toEqual([false, false, false, false]);
      week$.next(state({ loading: true, failure: FAILURE, week: WEEK }));
      expect(all('.day')).toHaveLength(0);
      expect(find('#week .failure').textContent).toBe('');
    });

    it('the view never shows or hides its own element: that is the shell\'s', () => {
      const { root, subscription } = mounted(state({ week: WEEK }));
      expect(root.hidden).toBe(true);
      subscription.unsubscribe();
      expect(root.hidden).toBe(true);
    });

    it('mounted again on the same element, it listens to the new screen only', () => {
      const first = mounted(state({ week: WEEK }));
      first.subscription.unsubscribe();
      const second = mounted(state({ week: OTHER }), 'user', [{ ...DETAIL, appointmentId: OTHER_APPOINTMENT }]);
      find('#week .next').click();
      expect(first.screen.next).not.toHaveBeenCalled();
      expect(second.screen.next).toHaveBeenCalledTimes(1);
      expect(texts('.day h3')).toEqual(['Mon 23 Nov']);
      // The dialogs too: an appointment's detail is asked of the new screen, a cancellation of
      // the new service.
      find('#week .appointment').click();
      cancelButton().click();
      expect(first.screen.detail).not.toHaveBeenCalled();
      expect(first.appointments.cancel).not.toHaveBeenCalled();
      expect(second.appointments.cancel).toHaveBeenCalledWith(OTHER_APPOINTMENT);
    });
  });
  // The note's form and "Change" in the detail, the banner of a move, and the book dialog as
  // the confirmation of a change.
  const noteForm = () => find<HTMLFormElement>('dialog.detail .note-form');
  const noteField = () => find<HTMLTextAreaElement>('dialog.detail [name="note"]');
  const noteSave = () => find<HTMLButtonElement>('dialog.detail .note-form .submit');
  const noted = () => find('dialog.detail .noted');
  const changeButton = () => find<HTMLButtonElement>('dialog.detail .change');
  const banner = () => find('#week .moving');
  const keep = () => find<HTMLButtonElement>('#week .keep');
  const appointmentButtons = () => all('.appointment') as HTMLButtonElement[];
  // The fixed texts of the book dialog a person can read: those of the mode that is not hidden.
  const shownTexts = (selector: string) => all(`dialog.book ${selector}`).filter((element) => !element.hidden).map((element) => element.textContent);
  const inChange = () => all('dialog.book .in-change').map((element) => element.hidden);
  const inBooking = () => all('dialog.book .in-booking').map((element) => element.hidden);

  const MOVING: Moving = { appointmentId: APPOINTMENT, when: 'Mon 16 Nov, 11:00–12:15', what: 'Mon 16 Nov, 11:00–12:15 · Studio', who: 'You', note: 'First lesson' };
  // The week with a second appointment on Monday.
  const TWO: WeekModel = {
    ...WEEK,
    days: [
      { ...WEEK.days[0]!, appointments: [...WEEK.days[0]!.appointments, { ...at('70%', '10%', '15:00–16:00'), appointmentId: OTHER_APPOINTMENT, who: 'You', typeName: 'Swimming Pool', note: '', colour: 5, beside: false }] },
      ...WEEK.days.slice(1),
    ],
  };
  const changed = (): ChangeState => ({ status: 'success', cancelled: {} as never, booked: {} as never });

  describe('"Change" in the appointment detail, opened from the week', () => {
    it('closes the dialog and calls move() with the id, once, and nothing else: no banner until the stream says so', () => {
      const { screen, appointments } = mounted(state({ week: WEEK }));
      find('#week .appointment').click();
      changeButton().click();
      expect(detail().open).toBe(false);
      expect(screen.move).toHaveBeenCalledTimes(1);
      expect(screen.move).toHaveBeenCalledWith(APPOINTMENT);
      expect(appointments.change).not.toHaveBeenCalled();
      expect(appointments.cancel).not.toHaveBeenCalled();
      expect(banner().hidden).toBe(true);
      expect(appointmentButtons()[0]!.disabled).toBe(false);
    });
  });

  describe('while an appointment is being moved', () => {
    // The view as the week screen's stream leaves it once a move has started.
    const moving = (role: Role = 'user', week = WEEK, moved = MOVING) => {
      const view = mounted(state({ week }), role);
      view.week$.next(state({ week, moving: moved }));
      return view;
    };

    it('before any move the banner is hidden and names nothing', () => {
      mounted(state({ week: WEEK }));
      expect(banner().hidden).toBe(true);
      expect(find('#week .moving-what').textContent).toBe('');
    });

    it('the banner names the appointment and offers to keep it as it is', () => {
      moving();
      expect(banner().hidden).toBe(false);
      expect(find('#week .moving p').textContent).toBe('Moving: Mon 16 Nov, 11:00–12:15 · Studio. Choose a free time.');
      expect(find('#week .moving p').getAttribute('role')).toBe('status');
      expect(keep().textContent).toBe('Keep the appointment as it is');
      expect(banner().closest('.week')).toBeNull(); // outside the region that is redrawn
    });

    it('for the Administrator the banner carries the User\'s name, as the stream gives it', () => {
      moving('admin', WEEK, { ...MOVING, what: 'Mon 16 Nov, 11:00–12:15 · Studio · alice', who: 'alice' });
      expect(find('#week .moving p').textContent).toBe('Moving: Mon 16 Nov, 11:00–12:15 · Studio · alice. Choose a free time.');
    });

    it('every appointment\'s button is disabled, so a click opens nothing; the slots stay enabled', () => {
      const { screen } = moving('user', TWO);
      expect(appointmentButtons().map((button) => button.disabled)).toEqual([true, true]);
      expect((all('.slot') as HTMLButtonElement[]).every((button) => !button.disabled)).toBe(true);
      appointmentButtons()[0]!.click();
      expect(detail().open).toBe(false);
      expect(screen.detail).not.toHaveBeenCalled();
    });

    it('a week redrawn while moving has its appointments disabled; one redrawn after the move ended has them enabled', () => {
      const { week$ } = moving();
      week$.next(state({ week: TWO, moving: MOVING }));
      expect(appointmentButtons().map((button) => button.disabled)).toEqual([true, true]);
      week$.next(state({ loading: true, week: TWO, moving: MOVING }));
      expect(banner().hidden).toBe(false);
      week$.next(state({ week: { ...TWO }, moving: null }));
      expect(appointmentButtons().map((button) => button.disabled)).toEqual([false, false]);
      expect(banner().hidden).toBe(true);
      expect(find('#week .moving-what').textContent).toBe('');
    });

    it('the move ended without a redraw: the same buttons are enabled again and open the detail', () => {
      const { week$ } = moving();
      const button = appointmentButtons()[0]!;
      week$.next(state({ week: WEEK, moving: null }));
      expect(appointmentButtons()[0]).toBe(button);
      expect(button.disabled).toBe(false);
      button.click();
      expect(detail().open).toBe(true);
    });

    it('in a week that does not hold the appointment the banner still names it', () => {
      const { week$ } = moving();
      week$.next(state({ label: '23 Nov – 29 Nov 2026', week: OTHER, moving: MOVING }));
      expect(find('#week .moving p').textContent).toBe('Moving: Mon 16 Nov, 11:00–12:15 · Studio. Choose a free time.');
      expect(appointmentButtons().map((button) => button.disabled)).toEqual([true]);
    });

    it('"Keep the appointment as it is" calls keep(), once, and changes nothing by itself', () => {
      const { screen } = moving();
      keep().click();
      expect(screen.keep).toHaveBeenCalledTimes(1);
      expect(banner().hidden).toBe(false);
      expect(appointmentButtons()[0]!.disabled).toBe(true);
    });

    it('the three buttons of the toolbar still work', () => {
      const { screen } = moving();
      find('#week .next').click();
      find('#week .previous').click();
      find('#week .today').click();
      expect([screen.next, screen.previous, screen.today].map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1]);
    });

    describe('the confirmation, for a User', () => {
      it('a click on a free slot opens the book dialog in its second mode: the title, the old time, the new one, the old note, "Change"', () => {
        const { appointments, users } = moving();
        find('#week .slot').click();
        expect(book().open).toBe(true);
        expect(inChange()).toEqual([false, false, false, false, false, false]);
        expect(inBooking()).toEqual([true, true, true, true, true]);
        expect(shownTexts('h3 span')).toEqual(['Change appointment']);
        expect(find('#week dialog.book .old').parentElement!.textContent).toBe('From: Mon 16 Nov, 11:00–12:15');
        expect(find('#week dialog.book .what').parentElement!.textContent).toBe('To: Mon 16 Nov, 08:00–09:00 · Studio');
        expect(note().value).toBe('First lesson');
        expect(shownTexts('.submit span')).toEqual(['Change']);
        expect(bookSubmit().disabled).toBe(false);
        expect(bookError().textContent).toBe('');
        expect(find('#week dialog.book .choices').hidden).toBe(true);
        expect(users.listUsers).not.toHaveBeenCalled();
        expect(appointments.change).not.toHaveBeenCalled();
      });

      it('"Change" calls change() with the id, the slot\'s start and the note left alone, once, and nothing else', () => {
        const { appointments } = moving();
        find('#week .slot').click();
        const { prevented } = submit(bookForm());
        expect(prevented).toBe(true);
        expect(appointments.change).toHaveBeenCalledTimes(1);
        expect(appointments.change).toHaveBeenCalledWith(APPOINTMENT, { start: '2026-11-16T07:00:00.000Z', note: 'First lesson' });
        expect(appointments.book).not.toHaveBeenCalled();
        expect(book().open).toBe(true);
        expect(bookSubmit().disabled).toBe(false);
      });

      it('the note edited is sent edited, the note emptied is sent empty: the key is always there', () => {
        const { appointments } = moving();
        find('#week .slot').click();
        note().value = 'Second lesson';
        submit(bookForm());
        expect(appointments.change).toHaveBeenLastCalledWith(APPOINTMENT, { start: '2026-11-16T07:00:00.000Z', note: 'Second lesson' });
        note().value = '';
        submit(bookForm());
        expect(appointments.change).toHaveBeenLastCalledWith(APPOINTMENT, { start: '2026-11-16T07:00:00.000Z', note: '' });
      });

      it('an appointment without a note opens the confirmation with an empty field', () => {
        const { appointments } = moving('user', WEEK, { ...MOVING, note: '' });
        find('#week .slot').click();
        expect(note().value).toBe('');
        submit(bookForm());
        expect(appointments.change).toHaveBeenCalledWith(APPOINTMENT, { start: '2026-11-16T07:00:00.000Z', note: '' });
      });

      it('changeState$ pending: "Change" is disabled; the dialog and the note stay', () => {
        const { changeState$ } = moving();
        find('#week .slot').click();
        note().value = 'Second lesson';
        submit(bookForm());
        changeState$.next({ status: 'pending', appointmentId: APPOINTMENT, change: { start: '2026-11-16T07:00:00.000Z', note: 'Second lesson' } });
        expect(bookSubmit().disabled).toBe(true);
        expect(book().open).toBe(true);
        expect(note().value).toBe('Second lesson');
      });

      it('changeState$ success: the dialog closes; the banner stays until the week screen\'s stream says the move is over', () => {
        const { changeState$, week$, screen } = moving();
        find('#week .slot').click();
        submit(bookForm());
        changeState$.next({ status: 'pending', appointmentId: APPOINTMENT, change: { start: '2026-11-16T07:00:00.000Z', note: 'First lesson' } });
        changeState$.next(changed());
        expect(book().open).toBe(false);
        expect(bookSubmit().disabled).toBe(false);
        expect(banner().hidden).toBe(false);
        expect(screen.keep).not.toHaveBeenCalled();
        week$.next(state({ week: WEEK, moving: null }));
        expect(banner().hidden).toBe(true);
      });

      it('changeState$ failure: the sentence in plain words, the dialog still open with what was typed; closed, the banner is still there', () => {
        const { changeState$, screen } = moving();
        find('#week .slot').click();
        note().value = 'Second lesson';
        submit(bookForm());
        changeState$.next({ status: 'pending', appointmentId: APPOINTMENT, change: { start: '2026-11-16T07:00:00.000Z', note: 'Second lesson' } });
        changeState$.next({ status: 'failure', reason: 'booking_notice_too_short', message: 'booking_notice_too_short: 3 h < 48 h' });
        expect(bookError().textContent).toBe('This time is too soon to be booked. Please choose a later one.');
        expect(book().open).toBe(true);
        expect(note().value).toBe('Second lesson');
        expect(bookSubmit().disabled).toBe(false);
        expect(find('#week').textContent).not.toContain('48 h');

        book().close(); // the Escape key
        expect(banner().hidden).toBe(false);
        expect(screen.keep).not.toHaveBeenCalled();
        // Another slot can be chosen: the confirmation opens clean, with the old note again.
        all('.slot')[1]!.click();
        expect(bookError().textContent).toBe('');
        expect(note().value).toBe('First lesson');
        expect(find('#week dialog.book .what').textContent).toBe('Mon 16 Nov, 02:00 +02:00 – 02:00 +01:00 · Studio');
      });

      it('too late to change: the reason is said as a change\'s, not as a cancellation\'s', () => {
        const { changeState$ } = moving();
        find('#week .slot').click();
        submit(bookForm());
        changeState$.next({ status: 'failure', reason: 'cancellation_notice_too_short', message: 'Too late to change this appointment' });
        expect(bookError().textContent).toBe('It is too late to change this appointment.');
      });

      it('the limit of upcoming appointments met by a change is said as a change\'s, not as a booking\'s; met by a booking, it keeps its own words', () => {
        const { changeState$, bookState$, week$ } = moving();
        find('#week .slot').click();
        submit(bookForm());
        changeState$.next({ status: 'failure', reason: 'appointment_limit_reached', message: 'appointment_limit_reached: 5 >= 1' });
        expect(bookError().textContent).toBe('You have more upcoming appointments than the calendar now allows, so this one cannot be moved. Cancel one first.');
        expect(banner().hidden).toBe(false);
        book().close();

        week$.next(state({ week: WEEK, moving: null }));
        find('#week .slot').click();
        submit(bookForm());
        bookState$.next({ status: 'failure', reason: 'appointment_limit_reached', message: 'appointment_limit_reached: 5 >= 1' });
        expect(bookError().textContent).toBe('You have as many upcoming appointments as the calendar allows. Cancel one to book another.');
      });

      it('"Close" closes the confirmation without a call, and the banner stays', () => {
        const { appointments, screen } = moving();
        find('#week .slot').click();
        find('#week dialog.book .close').click();
        expect(book().open).toBe(false);
        expect(appointments.change).not.toHaveBeenCalled();
        expect(screen.keep).not.toHaveBeenCalled();
        expect(banner().hidden).toBe(false);
      });

      it('a failure that was already in the stream is not shown at opening', () => {
        const { changeState$ } = moving();
        changeState$.next({ status: 'failure', reason: 'slot_taken', message: 'taken' });
        find('#week .slot').click();
        expect(bookError().textContent).toBe('');
      });

      it('a change still under way from an opening that was closed: "Change" is disabled, and its result is neither shown nor closes the new dialog', () => {
        const { changeState$ } = moving();
        find('#week .slot').click();
        submit(bookForm());
        changeState$.next({ status: 'pending', appointmentId: APPOINTMENT, change: { start: '2026-11-16T07:00:00.000Z', note: 'First lesson' } });
        book().close();

        all('.slot')[1]!.click();
        expect(bookSubmit().disabled).toBe(true);
        changeState$.next({ status: 'failure', reason: 'slot_taken', message: 'taken' });
        expect(bookError().textContent).toBe('');
        expect(bookSubmit().disabled).toBe(false);
        book().close();
        find('#week .slot').click();
        changeState$.next(changed());
        expect(book().open).toBe(true);
      });

      it('the confirmation still moves the appointment it was opened for when the week changes behind it', () => {
        const { week$, appointments } = moving();
        find('#week .slot').click();
        note().value = 'Typed';
        week$.next(state({ loading: true, week: WEEK, moving: MOVING }));
        week$.next(state({ week: OTHER, moving: MOVING }));
        expect(all('.slot')).toHaveLength(0);
        expect(book().open).toBe(true);
        expect(note().value).toBe('Typed');
        expect(find('#week dialog.book .old').textContent).toBe('Mon 16 Nov, 11:00–12:15');
        submit(bookForm());
        expect(appointments.change).toHaveBeenCalledWith(APPOINTMENT, { start: '2026-11-16T07:00:00.000Z', note: 'Typed' });
      });
    });

    describe('the confirmation, for the Administrator', () => {
      const FOR_ALICE = { ...MOVING, what: 'Mon 16 Nov, 11:00–12:15 · Studio · alice', who: 'alice' };

      it('shows the two times, set to the slot\'s own, and no choice of User: the list of users is not asked for', () => {
        const { users } = moving('admin', WEEK, FOR_ALICE);
        find('#week .slot').click();
        expect(find('#week dialog.book .choices').hidden).toBe(false);
        expect(find('#week dialog.book .user').hidden).toBe(true);
        expect(users.listUsers).not.toHaveBeenCalled();
        expect(options('username')).toEqual([]);
        expect(options('start')).toHaveLength(16);
        expect([select('start').value, select('end').value]).toEqual(['08:00', '09:00']);
        // "Change" does not wait for a list that is never asked for.
        expect(bookSubmit().disabled).toBe(false);
      });

      it('"Change" with the times not touched: the slot\'s own start and end, the note, never a username', () => {
        const { appointments } = moving('admin', WEEK, FOR_ALICE);
        find('#week .slot').click();
        submit(bookForm());
        expect(appointments.change).toHaveBeenCalledWith(APPOINTMENT, { start: '2026-11-16T07:00:00.000Z', end: '2026-11-16T08:00:00.000Z', note: 'First lesson' });
        expect(appointments.change.mock.lastCall![1]).not.toHaveProperty('username');
        expect(appointments.book).not.toHaveBeenCalled();
      });

      it('"Change" with a custom start and end: the two times of the slot\'s day in the calendar\'s zone', () => {
        const { appointments } = moving('admin', WEEK, FOR_ALICE);
        find('#week .slot').click();
        select('start').value = '10:15';
        select('end').value = '10:45';
        note().value = '';
        submit(bookForm());
        expect(appointments.change).toHaveBeenCalledWith(APPOINTMENT, { start: '2026-11-16T09:15:00.000Z', end: '2026-11-16T09:45:00.000Z', note: '' });
      });

      it('a list of users that arrives from an earlier booking dialog is left alone', () => {
        const { listUsersState$ } = moving('admin', WEEK, FOR_ALICE);
        find('#week .slot').click();
        listUsersState$.next(ALICE_AND_BOB);
        expect(options('username')).toEqual([]);
        listUsersState$.next({ status: 'failure', reason: 'network', message: 'x' });
        expect(usersMessage().textContent).toBe('');
        expect(bookSubmit().disabled).toBe(false);
      });

      it('a booking under way does not disable "Change", and a change under way does not disable "Book"', () => {
        const { bookState$, changeState$, week$, listUsersState$ } = moving('admin', WEEK, FOR_ALICE);
        bookState$.next({ status: 'pending', booking: { start: '2026-11-16T07:00:00.000Z' } });
        find('#week .slot').click();
        expect(bookSubmit().disabled).toBe(false);
        book().close();

        bookState$.next({ status: 'idle' });
        changeState$.next({ status: 'pending', appointmentId: APPOINTMENT, change: { start: '2026-11-16T07:00:00.000Z' } });
        week$.next(state({ week: WEEK, moving: null }));
        find('#week .slot').click();
        listUsersState$.next(ALICE_AND_BOB);
        expect(bookSubmit().disabled).toBe(false);
      });
    });

    describe('the two modes of the book dialog do not mix', () => {
      it('opened for a booking after a move, it shows nothing of the move', () => {
        const { week$, appointments } = moving();
        find('#week .slot').click();
        note().value = 'Typed in the confirmation';
        book().close();
        week$.next(state({ week: WEEK, moving: null }));

        find('#week .slot').click();
        expect(inChange()).toEqual([true, true, true, true, true, true]);
        expect(inBooking()).toEqual([false, false, false, false, false]);
        expect(shownTexts('h3 span')).toEqual(['Book an appointment']);
        expect(shownTexts('.submit span')).toEqual(['Book']);
        expect(find('#week dialog.book .old').textContent).toBe('');
        expect(note().value).toBe('');
        submit(bookForm());
        expect(appointments.book).toHaveBeenCalledWith({ start: '2026-11-16T07:00:00.000Z' });
        expect(appointments.change).not.toHaveBeenCalled();
      });

      it('opened for a move after a booking, it shows nothing of the booking', () => {
        const { week$, bookState$, appointments } = mounted(state({ week: WEEK }));
        find('#week .slot').click();
        note().value = 'Typed in the booking';
        submit(bookForm());
        bookState$.next({ status: 'failure', reason: 'slot_taken', message: 'taken' });
        book().close();
        week$.next(state({ week: WEEK, moving: MOVING }));

        find('#week .slot').click();
        expect(shownTexts('h3 span')).toEqual(['Change appointment']);
        expect(bookError().textContent).toBe('');
        expect(note().value).toBe('First lesson');
        submit(bookForm());
        expect(appointments.book).toHaveBeenCalledTimes(1);
        expect(appointments.change).toHaveBeenCalledTimes(1);
      });

      it('for the Administrator: the User picker is back in a booking after a move, and the list is asked for again', () => {
        const { week$, users, listUsersState$ } = moving('admin');
        find('#week .slot').click();
        book().close();
        week$.next(state({ week: WEEK, moving: null }));
        find('#week .slot').click();
        expect(find('#week dialog.book .user').hidden).toBe(false);
        expect(users.listUsers).toHaveBeenCalledTimes(1);
        expect(bookSubmit().disabled).toBe(true);
        listUsersState$.next(ALICE_AND_BOB);
        expect(bookSubmit().disabled).toBe(false);
      });

      it('a booking\'s result never shows in a confirmation: neither its failure nor its success', () => {
        const { bookState$ } = moving();
        find('#week .slot').click();
        submit(bookForm());
        bookState$.next({ status: 'failure', reason: 'slot_taken', message: 'taken' });
        expect(bookError().textContent).toBe('');
        bookState$.next(booked());
        expect(book().open).toBe(true);
      });

      it('a change\'s result never shows in a booking\'s dialog: neither its failure nor its success', () => {
        const { changeState$ } = mounted(state({ week: WEEK }));
        find('#week .slot').click();
        submit(bookForm());
        changeState$.next({ status: 'failure', reason: 'cancellation_notice_too_short', message: 'x' });
        expect(bookError().textContent).toBe('');
        changeState$.next(changed());
        expect(book().open).toBe(true);
      });
    });

    it('the texts of a move containing <script> are shown as text, and the note is put in the field as text', () => {
      moving('user', WEEK, { appointmentId: APPOINTMENT, when: SCRIPT, what: SCRIPT, who: 'You', note: SCRIPT });
      expect(find('#week .moving-what').textContent).toBe(SCRIPT);
      expect(find('#week .moving-what').children).toHaveLength(0);
      find('#week .slot').click();
      expect(find('#week dialog.book .old').textContent).toBe(SCRIPT);
      expect(find('#week dialog.book .old').children).toHaveLength(0);
      expect(note().value).toBe(SCRIPT);
      expect(note().children).toHaveLength(0);
      expect(document.querySelectorAll('script, b')).toHaveLength(0);
    });

    it('a reload while the detail is open with a note typed and a failure leaves them as they are', () => {
      const { week$, updateNoteState$, appointments } = mounted(state({ week: WEEK }));
      find('#week .appointment').click();
      noteField().value = 'Typed';
      submit(noteForm());
      updateNoteState$.next({ status: 'failure', reason: 'network', message: 'x' });
      week$.next(state({ loading: true, week: WEEK }));
      week$.next(state({ week: OTHER }));
      expect(texts('.day h3')).toEqual(['Mon 23 Nov']);
      expect(detail().open).toBe(true);
      expect(noteField().value).toBe('Typed');
      expect(detailError().textContent).toBe(FAILURE);
      submit(noteForm());
      expect(appointments.updateNote).toHaveBeenLastCalledWith(APPOINTMENT, 'Typed');
    });

    describe('leaving the view', () => {
      it('while moving, with the confirmation open after a failure: no banner, no dialog, and the page as index.html has it', () => {
        const before = html();
        const { subscription, changeState$ } = moving('admin', TWO, { ...MOVING, what: 'Mon 16 Nov, 11:00–12:15 · Studio · alice', who: 'alice' });
        find('#week .slot').click();
        note().value = 'A private note';
        submit(bookForm());
        changeState$.next({ status: 'pending', appointmentId: APPOINTMENT, change: { start: '2026-11-16T07:00:00.000Z' } });
        expect(bookSubmit().disabled).toBe(true);
        changeState$.next({ status: 'failure', reason: 'slot_taken', message: 'taken' });

        subscription.unsubscribe();
        expect(book().open).toBe(false);
        expect(banner().hidden).toBe(true);
        expect(find('#week .moving-what').textContent).toBe('');
        expect(note().value).toBe('');
        expect(find('#week dialog.book .old').textContent).toBe('');
        expect(inChange()).toEqual([true, true, true, true, true, true]);
        expect(inBooking()).toEqual([false, false, false, false, false]);
        expect(html()).not.toContain('alice');
        expect(html()).not.toContain('Mon 16 Nov');
        expect(html()).toBe(before);
      });

      it('with the detail open and a note typed, a save under way: closed, the field emptied, the buttons as index.html has them', () => {
        const before = html();
        const { subscription, updateNoteState$ } = mounted(state({ week: WEEK }));
        find('#week .appointment').click();
        noteField().value = 'A private note';
        submit(noteForm());
        updateNoteState$.next({ status: 'pending', appointmentId: APPOINTMENT, note: 'A private note' });
        expect(noteSave().disabled).toBe(true);

        subscription.unsubscribe();
        expect(detail().open).toBe(false);
        expect(noteField().value).toBe('');
        expect([noteForm().hidden, noted().hidden, changeButton().hidden, cancelButton().hidden, noteSave().disabled]).toEqual([true, false, true, true, false]);
        expect(html()).toBe(before);
      });

      it('the two new streams are no longer heard, and a week that arrives later shows no banner', () => {
        const { week$, changeState$, updateNoteState$, subscription } = moving();
        subscription.unsubscribe();
        expect([changeState$.observed, updateNoteState$.observed]).toEqual([false, false]);
        week$.next(state({ week: WEEK, moving: MOVING }));
        expect(banner().hidden).toBe(true);
      });

      it('mounted again on the same element, "Change", "Save note" and the banner\'s button reach the new objects only', () => {
        const first = moving();
        first.subscription.unsubscribe();
        const second = mounted(state({ week: WEEK }));
        find('#week .appointment').click();
        submit(noteForm());
        changeButton().click();
        keep().click();
        expect([first.appointments.updateNote, first.screen.move, first.screen.keep].map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0]);
        expect([second.appointments.updateNote, second.screen.move, second.screen.keep].map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1]);
      });
    });
  });
  describe('the capacity of a type (16.8)', () => {
    const book = () => find<HTMLDialogElement>('#week dialog.book');
    const bookForm = () => find<HTMLFormElement>('#week dialog.book form');
    const bookError = () => find('#week dialog.book .error');
    const anyway = () => find('#week dialog.book .anyway');
    const force = () => find<HTMLButtonElement>('#week dialog.book .force');
    const shown = (element: Element) => [...element.querySelectorAll<HTMLElement>('span')].filter((part) => !part.hidden).map((part) => part.textContent).join('');
    const FULL = 'This time is full: there is no place left.';
    const ALICE_AND_BOB: ListUsersState = { status: 'success', users: [{ username: 'alice' }, { username: 'bob' }] as never };
    // What the Administrator sends for the full slot, 09:00–10:00 in Rome, for alice.
    const SLOT_BODY = { start: '2026-11-16T08:00:00.000Z', end: '2026-11-16T09:00:00.000Z', username: 'alice', note: 'Extra' };
    const taken = { status: 'failure' as const, reason: 'slot_taken' as const, message: 'x' };

    // Monday: a slot with places left, a full one, and a group of four at 14:00.
    const GROUP: GroupBlock = {
      ...at('60%', '10%', '14:00–15:00'),
      what: '4 people · Swimming Pool',
      when: 'Mon 16 Nov, 14:00–15:00',
      colour: 5,
      beside: false,
      rows: [
        { appointmentId: APPOINTMENT, time: '14:00–15:00', who: 'alice' },
        { appointmentId: OTHER_APPOINTMENT, time: '14:00–15:00', who: SCRIPT },
        { appointmentId: 'appt-c', time: '14:15–15:00', who: 'carol' },
        { appointmentId: 'appt-d', time: '14:30–15:00', who: 'dan' },
      ],
    };
    const CAPACITY: WeekModel = {
      ...WEEK,
      days: [
        day('2026-11-16', 'Mon 16 Nov', {
          slots: [
            slot(at('0%', '10%', '08:00–09:00'), 5, { places: '2 of 3 places left', typeName: 'Swimming Pool' }),
            slot(at('10%', '10%', '09:00–10:00'), 5, { places: 'Full', full: true, start: '2026-11-16T08:00:00.000Z', end: '2026-11-16T09:00:00.000Z' }),
          ],
          appointments: [
            { ...at('30%', '10%', '11:00–12:00', 0, 3), appointmentId: 'appt-x', who: 'erin', typeName: 'Swimming Pool', note: '', colour: 5, beside: false },
            { ...at('30%', '10%', '11:00–12:00', 1, 3), appointmentId: 'appt-y', who: 'fred', typeName: 'Swimming Pool', note: '', colour: 5, beside: false },
            { ...at('30%', '10%', '11:00–12:00', 2, 3), appointmentId: 'appt-z', who: 'gina', typeName: 'Swimming Pool', note: '', colour: 5, beside: false },
          ],
          groups: [GROUP],
        }),
      ],
    };
    const slots = () => all('.slot') as HTMLButtonElement[];
    const group = () => find<HTMLDialogElement>('#week dialog.group');
    const groupBlock = () => find<HTMLButtonElement>('#week .group');

    // The Administrator's book dialog on a slot, the list of Users loaded, a note typed, "Book".
    const asked = (index = 1) => {
      const view = mounted(state({ week: CAPACITY }), 'admin');
      slots()[index]!.click();
      view.listUsersState$.next(ALICE_AND_BOB);
      find<HTMLTextAreaElement>('#week dialog.book [name="note"]').value = 'Extra';
      submit(bookForm());
      return view;
    };

    describe('the places of a slot', () => {
      it('a slot says its places beside its time; a full one says "Full" and is marked apart; both are named with their day', () => {
        mounted(state({ week: CAPACITY }), 'admin');
        expect(slots().map((button) => [button.textContent, button.classList.contains('full'), button.getAttribute('aria-label')])).toEqual([
          ['08:00–09:00 2 of 3 places left', false, 'Mon 16 Nov 08:00–09:00 2 of 3 places left'],
          ['09:00–10:00 Full', true, 'Mon 16 Nov 09:00–10:00 Full'],
        ]);
      });

      it('a full slot opens the book dialog like a free one', () => {
        mounted(state({ week: CAPACITY }), 'admin');
        slots()[1]!.click();
        expect([book().open, find('#week dialog.book .what').textContent]).toEqual([true, 'Mon 16 Nov, 09:00–10:00 · Studio']);
      });

      it('a slot that appointments overlap is a tab with its short text, named in full; an appointment and a group beside it are marked to leave it room', () => {
        const besides: WeekModel = {
          ...CAPACITY,
          days: [
            {
              ...CAPACITY.days[0]!,
              slots: [slot(at('30%', '10%', '11:00–12:00'), 5, { places: 'Full', full: true, tab: 'Full' }), slot(at('60%', '10%', '14:00–15:00'), 5, { places: '1 of 3 places left', tab: '1 left' })],
              appointments: CAPACITY.days[0]!.appointments.map((a) => ({ ...a, beside: true })),
              groups: [{ ...GROUP, beside: true }],
            },
          ],
        };
        mounted(state({ week: besides }), 'admin');
        expect(slots().map((button) => [button.querySelector('.places')!.textContent, button.classList.contains('tab'), button.classList.contains('full'), button.getAttribute('aria-label')])).toEqual([
          ['Full', true, true, 'Mon 16 Nov 11:00–12:00 Full'],
          ['1 left', true, false, 'Mon 16 Nov 14:00–15:00 1 of 3 places left'],
        ]);
        expect(all('.appointment').map((button) => button.classList.contains('beside'))).toEqual([true, true, true, true]);
        slots()[0]!.click();
        expect(book().open).toBe(true);
      });

      it('a slot drawn whole is no tab, and the blocks are not marked', () => {
        mounted(state({ week: CAPACITY }), 'admin');
        expect([...slots(), ...all('.appointment')].some((element) => element.classList.contains('tab') || element.classList.contains('beside'))).toBe(false);
      });

      it('a slot of capacity one says "free", as the page always did', () => {
        mounted(state({ week: WEEK }));
        expect(slots()[0]!.textContent).toBe('08:00–09:00 free');
      });
    });

    describe('"Book anyway" (R-BOOK-13)', () => {
      it('the Administrator refused because the time is full: the dialog stays open with the sentence and the offer', () => {
        const { bookState$, screen } = asked();
        bookState$.next({ status: 'pending', booking: SLOT_BODY });
        bookState$.next(taken);
        expect([book().open, bookError().textContent, anyway().hidden, shown(anyway().querySelector('p')!), shown(force())]).toEqual([true, FULL, false, 'Book anyway, over the capacity?', 'Book anyway']);
        // The screen was asked for the words with what the dialog sent.
        expect(screen.refusal).toHaveBeenLastCalledWith('slot_taken', {
          slot: CAPACITY.days[0]!.slots[1],
          zone: 'Europe/Rome',
          fields: { note: 'Extra', username: 'alice', start: '09:00', end: '10:00' },
          moving: null,
        });
      });

      it('"Book anyway" sends the same booking again with overbook: true; a success closes the dialog', () => {
        const { bookState$, appointments } = asked();
        bookState$.next(taken);
        force().click();
        expect(appointments.book.mock.calls).toEqual([[SLOT_BODY], [{ ...SLOT_BODY, overbook: true }]]);
        bookState$.next({ status: 'pending', booking: { ...SLOT_BODY, overbook: true } });
        expect([bookError().textContent, anyway().hidden, force().disabled]).toEqual(['', true, true]);
        bookState$.next(booked());
        expect(book().open).toBe(false);
      });

      it('changing anything in the dialog hides the offer: it is for the request refused only', () => {
        const { bookState$ } = asked();
        for (const change of [
          () => find('#week dialog.book [name="note"]').dispatchEvent(new Event('input', { bubbles: true })),
          () => find('#week dialog.book [name="start"]').dispatchEvent(new Event('change', { bubbles: true })),
          () => find('#week dialog.book [name="username"]').dispatchEvent(new Event('change', { bubbles: true })),
        ]) {
          bookState$.next(taken);
          expect(anyway().hidden).toBe(false);
          change();
          expect(anyway().hidden).toBe(true);
        }
        // The sentence stays: the time asked was full.
        expect(bookError().textContent).toBe(FULL);
      });

      it('a new opening shows no offer', () => {
        const { bookState$ } = asked();
        bookState$.next(taken);
        book().close();
        slots()[0]!.click();
        expect([anyway().hidden, bookError().textContent]).toEqual([true, '']);
      });

      it('a User refused because the time is full gets the sentence of every page, and no offer', () => {
        const { bookState$ } = mounted(state({ week: CAPACITY }));
        slots()[0]!.click();
        submit(bookForm());
        bookState$.next(taken);
        expect([bookError().textContent, anyway().hidden]).toEqual(['This time is full: there is no place left. The calendar has been refreshed: please choose another time.', true]);
      });

      it('user_busy is said in the words the screen chooses, the appointment named, and nothing is offered (R-BOOK-12)', () => {
        const { bookState$, screen } = asked();
        screen.refusal.mockReturnValueOnce({ text: 'alice already has an appointment at this time (09:15–10:00 · Studio).', offer: false });
        bookState$.next({ status: 'failure', reason: 'user_busy', message: 'x' });
        expect([bookError().textContent, anyway().hidden]).toEqual(['alice already has an appointment at this time (09:15–10:00 · Studio).', true]);
        expect(screen.refusal.mock.lastCall![0]).toBe('user_busy');
      });

      it('in a change: "Change anyway" sends the same change again with overbook: true', () => {
        const view = mounted(state({ week: CAPACITY }), 'admin');
        const moved: Moving = { appointmentId: APPOINTMENT, when: 'Mon 16 Nov, 11:00–12:15', what: 'Mon 16 Nov, 11:00–12:15 · Studio · alice', who: 'alice', note: '' };
        view.week$.next(state({ week: CAPACITY, moving: moved }));
        slots()[1]!.click();
        submit(bookForm());
        view.changeState$.next(taken);
        expect([bookError().textContent, anyway().hidden, shown(anyway().querySelector('p')!), shown(force())]).toEqual([FULL, false, 'Change anyway, over the capacity?', 'Change anyway']);
        expect(view.screen.refusal.mock.lastCall![1].moving).toBe(moved);
        force().click();
        const body = { start: '2026-11-16T08:00:00.000Z', end: '2026-11-16T09:00:00.000Z', note: '' };
        expect(view.appointments.change.mock.calls).toEqual([[APPOINTMENT, body], [APPOINTMENT, { ...body, overbook: true }]]);
        view.changeState$.next({ status: 'pending', appointmentId: APPOINTMENT, change: { ...body, overbook: true } });
        expect(force().disabled).toBe(true);
        view.changeState$.next(changed());
        expect(book().open).toBe(false);
      });
    });

    describe('the Administrator\'s appointments at the same time', () => {
      it('three side by side, each in its column', () => {
        mounted(state({ week: CAPACITY }), 'admin');
        expect((all('.appointment:not(.group)') as HTMLButtonElement[]).map((button) => [button.querySelector('.who')!.textContent, [...button.classList].find((name) => name.startsWith('lane-'))])).toEqual([
          ['erin', 'lane-0-of-3'],
          ['fred', 'lane-1-of-3'],
          ['gina', 'lane-2-of-3'],
        ]);
      });

      it('four or more are one block: its time and "4 people · Swimming Pool", the type\'s colour, named with its day', () => {
        mounted(state({ week: CAPACITY }), 'admin');
        const block = groupBlock();
        expect([block.tagName, block.textContent, block.classList.contains('type-5'), block.classList.contains('appointment'), block.style.top, block.getAttribute('aria-label')]).toEqual([
          'BUTTON',
          '14:00–15:00 4 people · Swimming Pool',
          true,
          true,
          '60%',
          'Mon 16 Nov 14:00–15:00 4 people · Swimming Pool',
        ]);
        expect(group().open).toBe(false);
      });

      it('the block opens the list: its heading, its time, one row per appointment with its time and its User; a name with <script> stays text', () => {
        mounted(state({ week: CAPACITY }), 'admin');
        groupBlock().click();
        expect([group().open, find('#week dialog.group .what').textContent, find('#week dialog.group .when').textContent]).toEqual([true, '4 people · Swimming Pool', 'Mon 16 Nov, 14:00–15:00']);
        const rows = all('dialog.group .people li');
        expect(rows.map((row) => [row.querySelector('.time')!.textContent, row.querySelector('.who')!.textContent])).toEqual(GROUP.rows.map((row) => [row.time, row.who]));
        expect(rows[1]!.querySelector('.who')!.children).toHaveLength(0);
      });

      it('a row closes the list and opens the appointment\'s detail, as a block does', () => {
        const { screen } = mounted(state({ week: CAPACITY }), 'admin');
        groupBlock().click();
        all('dialog.group .person')[0]!.click();
        expect(group().open).toBe(false);
        expect(screen.detail).toHaveBeenLastCalledWith(APPOINTMENT);
        expect(find<HTMLDialogElement>('dialog.detail').open).toBe(true);
      });

      it('opened again, the list holds only the rows of the block pressed; "Close" closes it with no call', () => {
        const { screen } = mounted(state({ week: CAPACITY }), 'admin');
        groupBlock().click();
        find('#week dialog.group .close').click();
        expect(group().open).toBe(false);
        groupBlock().click();
        expect(all('dialog.group .people li')).toHaveLength(4);
        expect(screen.detail).not.toHaveBeenCalled();
      });

      it('while an appointment is being moved the block cannot be pressed, like every appointment', () => {
        const view = mounted(state({ week: CAPACITY }), 'admin');
        view.week$.next(state({ week: CAPACITY, moving: { appointmentId: 'appt-x', when: 'w', what: 'w', who: 'erin', note: '' } }));
        expect(groupBlock().disabled).toBe(true);
      });

      it('leaving the view closes the list and empties it: the page as index.html has it', () => {
        const before = html();
        const { subscription } = mounted(state({ week: CAPACITY }), 'admin');
        groupBlock().click();
        slots()[1]!.click();
        subscription.unsubscribe();
        expect([group().open, all('dialog.group li').length, find('#week dialog.group .what').textContent, anyway().hidden]).toEqual([false, 0, '', true]);
        expect(html()).toBe(before);
      });
    });
  });
});
