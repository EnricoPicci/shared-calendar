import { BehaviorSubject } from 'rxjs';
import type { AppointmentDetail } from '../../../src/logic/appointment.detail';
import type { AppointmentRow } from '../../../src/logic/appointments.model';
import type { ListState } from '../../../src/logic/appointments.screen';
import type { CancelState, UpdateNoteState } from '../../../src/services/appointments.types';
import { mountAppointments, type AppointmentsDeps } from '../../../src/views/appointments.view';
import { find, submit, useRealPage } from './page';
import { PAGE_TEXTS_EN } from '../../../src/texts/texts.en';

// The DOM test of the view of "My appointments" (docs/FRONTEND_ARCHITECTURE.md section 8): the
// real index.html, and a fake AppointmentsScreen and a fake AppointmentsService whose streams
// the test controls and whose methods are spies. The rows and the details are written by hand:
// what the view does with them is checked here, how they are made in the logic layer's tests.
// What the detail dialog does once it is open is in detail.view.test.ts.

const SCRIPT = '<script>window.hacked = true</script><b>bold</b>';
const FAILURE = 'The server cannot be reached. Check the connection and try again.';
const APPOINTMENT = '01M6DMQ0000000000000000001';
const OTHER_APPOINTMENT = '01M6DMQ0000000000000000002';

const row = (over: Partial<AppointmentRow> = {}): AppointmentRow => ({
  appointmentId: APPOINTMENT,
  date: 'Mon 23 Nov',
  time: '10:00–11:00',
  typeName: 'Studio',
  note: 'First lesson',
  kind: 'booked',
  status: 'Booked',
  ...over,
});
const ROWS = [row(), row({ appointmentId: OTHER_APPOINTMENT, date: 'Tue 24 Nov', time: '15:00–16:00', typeName: 'Swimming Pool', note: '' })];
const HISTORY = [
  row({ appointmentId: 'a', date: 'Mon 16 Nov', kind: 'ended', status: 'Ended' }),
  row({ appointmentId: 'b', date: 'Tue 17 Nov', kind: 'cancelled', status: 'Cancelled' }),
  row({ appointmentId: 'c', date: 'Wed 18 Nov', kind: 'changed', status: 'Changed' }),
  row({ appointmentId: 'd', date: 'Mon 23 Nov', kind: 'booked', status: 'Booked' }),
];
const PERIOD = { from: '2026-10-21', to: '2026-11-19' };

const state = (over: Partial<ListState> = {}): ListState => ({ mode: 'upcoming', period: null, loading: false, failure: null, refusal: null, rows: null, empty: null, ...over });

const DETAIL: AppointmentDetail = {
  appointmentId: APPOINTMENT,
  when: 'Mon 23 Nov, 10:00–11:00',
  typeName: 'Studio',
  who: 'You',
  note: 'First lesson',
  noteValue: 'First lesson',
  booked: 'Booked by you on Thu 19 Nov, 13:24',
  canEditNote: true,
  canChange: true,
  canCancel: true,
  hint: 'It can be changed or cancelled until Sun 22 Nov, 10:00.',
};

function mounted(first: ListState = state(), details: AppointmentDetail[] = [DETAIL]) {
  const list$ = new BehaviorSubject<ListState>(first);
  const cancelState$ = new BehaviorSubject<CancelState>({ status: 'idle' });
  const updateNoteState$ = new BehaviorSubject<UpdateNoteState>({ status: 'idle' });
  // The order in which the list screen and the shell are told of a "Change".
  const order: string[] = [];
  const screen = {
    list$: list$.asObservable(),
    upcoming: vi.fn<AppointmentsDeps['screen']['upcoming']>(),
    history: vi.fn<AppointmentsDeps['screen']['history']>(),
    show: vi.fn<AppointmentsDeps['screen']['show']>(),
    detail: vi.fn<AppointmentsDeps['screen']['detail']>((id) => details.find((detail) => detail.appointmentId === id) ?? null),
    move: vi.fn<AppointmentsDeps['screen']['move']>(() => void order.push('move')),
  };
  const appointments = {
    cancelState$: cancelState$.asObservable(),
    updateNoteState$: updateNoteState$.asObservable(),
    cancel: vi.fn<AppointmentsDeps['appointments']['cancel']>(),
    updateNote: vi.fn<AppointmentsDeps['appointments']['updateNote']>(),
  };
  const showWeek = vi.fn<AppointmentsDeps['showWeek']>(() => void order.push('showWeek'));
  const root = find('#appointments');
  const subscription = mountAppointments(root, { screen, appointments, showWeek, texts: PAGE_TEXTS_EN });
  return { list$, cancelState$, updateNoteState$, screen, appointments, showWeek, order, root, subscription };
}

const one = <T extends HTMLElement = HTMLElement>(selector: string) => find<T>(`#appointments ${selector}`);
const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(`#appointments ${selector}`)];
const texts = (selector: string) => all(selector).map((element) => element.textContent);
const pressed = () => [one('.upcoming'), one('.history')].map((button) => button.getAttribute('aria-pressed'));
const from = () => one<HTMLInputElement>('[name="from"]');
const to = () => one<HTMLInputElement>('[name="to"]');
const period = () => one<HTMLFormElement>('.period');
const dialog = () => find<HTMLDialogElement>('dialog.detail');
const html = () => document.documentElement.outerHTML;

describe('mountAppointments', () => {
  useRealPage();

  describe('the states of list$', () => {
    it('nothing yet, on "upcoming": its button pressed, no form, no "Loading…", no failure, no sentence, no row', () => {
      mounted();
      expect(pressed()).toEqual(['true', 'false']);
      expect(period().hidden).toBe(true);
      expect([one('.loading').hidden, one('.failure').hidden, one('.empty').hidden]).toEqual([true, true, true]);
      expect(all('.row')).toHaveLength(0);
      expect(one('.list').classList.contains('stale')).toBe(false);
    });

    it('loading without a list: "Loading…" is shown', () => {
      mounted(state({ loading: true }));
      expect(one('.loading').hidden).toBe(false);
      expect(one('.loading').textContent).toBe('Loading…');
      expect(one('.loading').getAttribute('role')).toBe('status');
      expect(all('.row')).toHaveLength(0);
    });

    it('a list: one row per appointment, in the order given, each with its date, time, type, note and status', () => {
      mounted(state({ rows: ROWS }));
      expect(all('.row').map((button) => [...button.children].map((part) => part.textContent))).toEqual([
        ['Mon 23 Nov', '10:00–11:00', 'Studio', 'First lesson', 'Booked'],
        ['Tue 24 Nov', '15:00–16:00', 'Swimming Pool', '', 'Booked'],
      ]);
      expect(one('.empty').hidden).toBe(true);
      expect(one('.loading').hidden).toBe(true);
    });

    it('every status has its words and its class', () => {
      mounted(state({ mode: 'history', period: PERIOD, rows: HISTORY }));
      expect(texts('.row .status')).toEqual(['Ended', 'Cancelled', 'Changed', 'Booked']);
      expect(all('.row').map((button) => button.className)).toEqual(['row is-ended', 'row is-cancelled', 'row is-changed', 'row is-booked']);
    });

    it('a row is a button a keyboard reaches, named by its text; the list holds no field and no link', () => {
      mounted(state({ rows: ROWS }));
      for (const button of all('.row')) {
        expect([button.tagName, button.getAttribute('type')]).toEqual(['BUTTON', 'button']);
        expect(button.hasAttribute('tabindex')).toBe(false);
      }
      expect(all('.row')[0]!.textContent).toBe('Mon 23 Nov 10:00–11:00 Studio First lesson Booked');
      expect(all('.list input, .list select, .list textarea, .list a')).toHaveLength(0);
      expect(all('.list > li > .row')).toHaveLength(2);
    });

    it('loading with a list: the list stays, dimmed', () => {
      const { list$ } = mounted(state({ rows: ROWS }));
      list$.next(state({ rows: ROWS, loading: true }));
      expect(one('.loading').hidden).toBe(false);
      expect(one('.list').classList.contains('stale')).toBe(true);
      expect(all('.row')).toHaveLength(2);
      list$.next(state({ rows: ROWS }));
      expect(one('.list').classList.contains('stale')).toBe(false);
    });

    it('an empty list: the sentence the stream brings, and no row', () => {
      const { list$ } = mounted(state({ rows: [], empty: 'You have no upcoming appointments.' }));
      expect(one('.empty').hidden).toBe(false);
      expect(one('.empty').textContent).toBe('You have no upcoming appointments.');
      expect(all('.row')).toHaveLength(0);
      list$.next(state({ rows: ROWS }));
      expect(one('.empty').hidden).toBe(true);
      expect(one('.empty').textContent).toBe('');
    });

    it('a failure without a list: the sentence, announced, in the place of the list', () => {
      mounted(state({ failure: FAILURE }));
      expect(one('.failure').hidden).toBe(false);
      expect(one('.failure').textContent).toBe(FAILURE);
      expect(one('.failure').getAttribute('role')).toBe('alert');
      expect(all('.row')).toHaveLength(0);
    });

    it('a failure with a list: the sentence, and the last list still on screen; a success removes the sentence', () => {
      const { list$ } = mounted(state({ rows: ROWS }));
      list$.next(state({ rows: ROWS, failure: FAILURE }));
      expect(one('.failure').textContent).toBe(FAILURE);
      expect(all('.row')).toHaveLength(2);
      list$.next(state({ rows: ROWS }));
      expect(one('.failure').hidden).toBe(true);
      expect(one('.failure').textContent).toBe('');
    });

    it('history: its button pressed, the form shown with the period the stream brings', () => {
      const { list$ } = mounted();
      list$.next(state({ mode: 'history', period: PERIOD, loading: true }));
      expect(pressed()).toEqual(['false', 'true']);
      expect(period().hidden).toBe(false);
      expect([from().value, to().value]).toEqual(['2026-10-21', '2026-11-19']);
      expect(one('.refusal').textContent).toBe('');
    });

    it('back to upcoming: the form is hidden, and still holds the period for the next time', () => {
      const { list$ } = mounted(state({ mode: 'history', period: PERIOD }));
      list$.next(state({ mode: 'upcoming', period: PERIOD, rows: ROWS }));
      expect(pressed()).toEqual(['true', 'false']);
      expect(period().hidden).toBe(true);
      expect([from().value, to().value]).toEqual(['2026-10-21', '2026-11-19']);
    });

    it('a refusal of the period: the sentence beside the form, announced, and the list as it was; it goes when the stream says so', () => {
      const { list$ } = mounted(state({ mode: 'history', period: PERIOD, rows: HISTORY }));
      const first = all('.row')[0];
      list$.next(state({ mode: 'history', period: PERIOD, rows: HISTORY, refusal: 'Choose both dates.' }));
      const refusal = one('.refusal');
      expect(refusal.textContent).toBe('Choose both dates.');
      expect(refusal.getAttribute('role')).toBe('alert');
      expect(refusal.closest('.period')).not.toBeNull();
      expect(all('.row')[0]).toBe(first);
      expect(one('.failure').hidden).toBe(true);
      list$.next(state({ mode: 'history', period: PERIOD, rows: HISTORY }));
      expect(refusal.textContent).toBe('');
    });
  });

  describe('the user\'s actions', () => {
    it.each([
      ['.upcoming', 'upcoming'],
      ['.history', 'history'],
    ] as const)('a click on %s calls %s(), once, and changes nothing on screen by itself', (selector, method) => {
      const { screen } = mounted(state({ rows: ROWS }));
      const before = html();
      one(selector).click();
      expect({ upcoming: screen.upcoming.mock.calls.length, history: screen.history.mock.calls.length }).toEqual({ upcoming: 0, history: 0, [method]: 1 });
      expect(html()).toBe(before);
    });

    it('"Show" calls show() with the two dates as the fields hold them, once, and changes nothing by itself', () => {
      const { screen } = mounted(state({ mode: 'history', period: PERIOD, rows: HISTORY }));
      from().value = '2026-09-01';
      to().value = '2026-09-30';
      const { prevented } = submit(period());
      expect(prevented).toBe(true);
      expect(screen.show).toHaveBeenCalledTimes(1);
      expect(screen.show).toHaveBeenCalledWith('2026-09-01', '2026-09-30');
      expect(all('.row')).toHaveLength(4);
      expect(one('.refusal').textContent).toBe('');
      expect(one('.loading').hidden).toBe(true);
    });

    it('an emptied date goes to the logic layer as an empty text: the view checks nothing', () => {
      const { screen } = mounted(state({ mode: 'history', period: PERIOD }));
      from().value = '';
      submit(period());
      expect(screen.show).toHaveBeenCalledWith('', '2026-11-19');
      to().value = '2026-01-01'; // before the first date: not the view's to say
      from().value = '2026-11-19';
      submit(period());
      expect(screen.show).toHaveBeenLastCalledWith('2026-11-19', '2026-01-01');
    });

    it('a click on a row asks the list screen for its detail and opens the dialog with it', () => {
      const { screen } = mounted(state({ rows: ROWS }));
      all('.row')[0]!.click();
      expect(screen.detail).toHaveBeenCalledTimes(1);
      expect(screen.detail).toHaveBeenCalledWith(APPOINTMENT);
      expect(dialog().open).toBe(true);
      expect(find('dialog.detail .when').textContent).toBe('Mon 23 Nov, 10:00–11:00');
      expect(find('dialog.detail .hint').textContent).toBe('It can be changed or cancelled until Sun 22 Nov, 10:00.');
      expect(find<HTMLTextAreaElement>('dialog.detail [name="note"]').value).toBe('First lesson');
    });

    it('each row opens its own appointment; one the list screen no longer holds opens nothing', () => {
      const { screen } = mounted(state({ rows: ROWS }));
      all('.row')[1]!.click();
      expect(screen.detail).toHaveBeenCalledWith(OTHER_APPOINTMENT);
      expect(dialog().open).toBe(false);
    });

    it('a row of the history opens the detail with its sentence, the note as text and no button but "Close"', () => {
      const cancelled: AppointmentDetail = { ...DETAIL, appointmentId: 'b', canEditNote: false, canChange: false, canCancel: false, hint: 'This appointment was cancelled.' };
      mounted(state({ mode: 'history', period: PERIOD, rows: HISTORY }), [cancelled]);
      all('.row')[1]!.click();
      expect(dialog().open).toBe(true);
      expect(find('dialog.detail .hint').textContent).toBe('This appointment was cancelled.');
      expect(find('dialog.detail .noted').hidden).toBe(false);
      expect(find('dialog.detail .note').textContent).toBe('First lesson');
      const shown = [...dialog().querySelectorAll<HTMLButtonElement>('button')].filter((button) => !button.hidden && button.closest('form[hidden]') === null);
      expect(shown.map((button) => button.textContent)).toEqual(['Close']);
    });

    it('"Cancel appointment" and "Save note" in the dialog call the service the view was given', () => {
      const { appointments } = mounted(state({ rows: ROWS }));
      all('.row')[0]!.click();
      find('dialog.detail .cancel').click();
      expect(appointments.cancel).toHaveBeenCalledWith(APPOINTMENT);
      find<HTMLTextAreaElement>('dialog.detail [name="note"]').value = 'Second lesson';
      submit(find<HTMLFormElement>('dialog.detail .note-form'));
      expect(appointments.updateNote).toHaveBeenCalledWith(APPOINTMENT, 'Second lesson');
    });

    it('"Change" in the dialog closes it, hands the appointment over through the list screen, then asks for the week: once each, in that order', () => {
      const { screen, showWeek, order, appointments } = mounted(state({ rows: ROWS }));
      all('.row')[0]!.click();
      find('dialog.detail .change').click();
      expect(dialog().open).toBe(false);
      expect(screen.move).toHaveBeenCalledTimes(1);
      expect(screen.move).toHaveBeenCalledWith(APPOINTMENT);
      expect(showWeek).toHaveBeenCalledTimes(1);
      expect(order).toEqual(['move', 'showWeek']);
      expect(appointments.cancel).not.toHaveBeenCalled();
    });

    it('nothing but "Change" asks for the week', () => {
      const { showWeek, cancelState$, updateNoteState$ } = mounted(state({ rows: ROWS }));
      one('.history').click();
      all('.row')[0]!.click();
      find('dialog.detail .cancel').click();
      cancelState$.next({ status: 'success', appointment: {} as never });
      all('.row')[0]!.click();
      submit(find<HTMLFormElement>('dialog.detail .note-form'));
      updateNoteState$.next({ status: 'success', appointment: {} as never });
      expect(showWeek).not.toHaveBeenCalled();
    });
  });

  it('a date, a time, a type, a note and a status containing <script> are shown as text; so are the sentences', () => {
    mounted(state({ rows: [row({ date: SCRIPT, time: SCRIPT, typeName: SCRIPT, note: SCRIPT, status: SCRIPT })], failure: SCRIPT, refusal: SCRIPT, empty: SCRIPT }));
    for (const selector of ['.row .date', '.row .time', '.row .type-name', '.row .note', '.row .status', '.failure', '.refusal', '.empty']) {
      const element = one(selector);
      expect(element.textContent, selector).toBe(SCRIPT);
      expect(element.children, selector).toHaveLength(0);
    }
    expect(document.querySelectorAll('script, b')).toHaveLength(0);
  });

  describe('redrawing', () => {
    it('another list replaces the first, with nothing left of it', () => {
      const { list$ } = mounted(state({ rows: ROWS }));
      list$.next(state({ mode: 'history', period: PERIOD, rows: [row({ appointmentId: 'x', date: 'Fri 2 Oct', time: '09:00–10:00', typeName: 'Piscina', note: '', kind: 'cancelled', status: 'Cancelled' })] }));
      expect(texts('.row')).toEqual(['Fri 2 Oct 09:00–10:00 Piscina  Cancelled']);
      for (const gone of ['Studio', 'First lesson', 'Swimming Pool', '23 Nov']) expect(one('.list').textContent).not.toContain(gone);
    });

    it('the rows are rebuilt only when the list is another object, not at every notification', () => {
      const { list$ } = mounted(state({ rows: ROWS }));
      const first = all('.row');
      list$.next(state({ rows: ROWS, loading: true }));
      list$.next(state({ rows: ROWS, failure: FAILURE }));
      list$.next(state({ rows: ROWS, refusal: 'Choose both dates.' }));
      expect(all('.row')).toEqual(first);
      expect(all('.row')[0]).toBe(first[0]);

      list$.next(state({ rows: [...ROWS] }));
      expect(all('.row')[0]).not.toBe(first[0]);
    });

    it('a list dropped by the stream empties the page\'s', () => {
      const { list$ } = mounted(state({ rows: ROWS }));
      list$.next(state({ mode: 'history', period: PERIOD, loading: true }));
      expect(all('.row')).toHaveLength(0);
    });

    it('the two dates are set only when the period is another object: a date being typed is left alone by a list that arrives', () => {
      const { list$ } = mounted(state({ mode: 'history', period: PERIOD, rows: HISTORY }));
      from().value = '2026-09-01';
      list$.next(state({ mode: 'history', period: PERIOD, rows: HISTORY, loading: true }));
      list$.next(state({ mode: 'history', period: PERIOD, rows: [...HISTORY] }));
      list$.next(state({ mode: 'history', period: PERIOD, rows: HISTORY, refusal: 'The first date is after the last one.' }));
      expect(from().value).toBe('2026-09-01');

      list$.next(state({ mode: 'history', period: { from: '2026-08-01', to: '2026-08-31' }, rows: HISTORY }));
      expect([from().value, to().value]).toEqual(['2026-08-01', '2026-08-31']);
    });

    it('a list that arrives behind the open dialog leaves it as it is', () => {
      const { list$, appointments } = mounted(state({ rows: ROWS }));
      all('.row')[0]!.click();
      find<HTMLTextAreaElement>('dialog.detail [name="note"]').value = 'Typed';
      list$.next(state({ rows: ROWS, loading: true }));
      list$.next(state({ rows: [ROWS[1]!] }));
      expect(all('.row')).toHaveLength(1);
      expect(dialog().open).toBe(true);
      expect(find<HTMLTextAreaElement>('dialog.detail [name="note"]').value).toBe('Typed');
      submit(find<HTMLFormElement>('dialog.detail .note-form'));
      expect(appointments.updateNote).toHaveBeenCalledWith(APPOINTMENT, 'Typed');
    });
  });

  describe('leaving the view', () => {
    it('after unsubscribing nothing is left in the page, which is as index.html has it: no row, no sentence, the two dates emptied', () => {
      const before = html();
      const { subscription } = mounted(state({ mode: 'history', period: PERIOD, loading: true, failure: FAILURE, refusal: 'Choose both dates.', rows: HISTORY }));
      to().value = '2026-12-31';
      expect(html()).not.toBe(before);

      subscription.unsubscribe();
      expect(all('.row')).toHaveLength(0);
      expect([from().value, to().value]).toEqual(['', '']);
      expect(period().hidden).toBe(true);
      expect(pressed()).toEqual(['false', 'false']);
      expect([one('.loading').hidden, one('.failure').hidden, one('.empty').hidden]).toEqual([true, true, true]);
      expect([one('.failure').textContent, one('.refusal').textContent, one('.empty').textContent]).toEqual(['', '', '']);
      expect(one('.list').classList.contains('stale')).toBe(false);
      expect(html()).toBe(before);
    });

    it('with an empty list on show: the sentence is gone', () => {
      const before = html();
      const { subscription } = mounted(state({ rows: [], empty: 'You have no upcoming appointments.' }));
      subscription.unsubscribe();
      expect(html()).not.toContain('no upcoming');
      expect(html()).toBe(before);
    });

    it('with the detail open and a note typed: closed, emptied, and the page as index.html has it', () => {
      const before = html();
      const { subscription } = mounted(state({ rows: ROWS }));
      all('.row')[0]!.click();
      find<HTMLTextAreaElement>('dialog.detail [name="note"]').value = 'A private note';
      expect(dialog().open).toBe(true);

      subscription.unsubscribe();
      expect(dialog().open).toBe(false);
      expect(find<HTMLTextAreaElement>('dialog.detail [name="note"]').value).toBe('');
      expect(html()).not.toContain('First lesson');
      expect(html()).toBe(before);
    });

    it('the streams are no longer heard', () => {
      const { list$, cancelState$, updateNoteState$, subscription } = mounted();
      subscription.unsubscribe();
      expect([list$.observed, cancelState$.observed, updateNoteState$.observed]).toEqual([false, false, false]);
      list$.next(state({ mode: 'history', period: PERIOD, rows: ROWS, failure: FAILURE }));
      expect(all('.row')).toHaveLength(0);
      expect(one('.failure').textContent).toBe('');
      expect(from().value).toBe('');
    });

    it('the view never shows or hides its own element: that is the shell\'s', () => {
      const { root, subscription } = mounted(state({ rows: ROWS }));
      expect(root.hidden).toBe(true);
      subscription.unsubscribe();
      expect(root.hidden).toBe(true);
    });

    it('mounted again on the same element, it listens to the new screen only, and fills the dates again', () => {
      const first = mounted(state({ mode: 'history', period: PERIOD, rows: HISTORY }));
      first.subscription.unsubscribe();
      const second = mounted(state({ mode: 'history', period: PERIOD, rows: ROWS }));
      expect([from().value, to().value]).toEqual(['2026-10-21', '2026-11-19']);
      one('.upcoming').click();
      submit(period());
      all('.row')[0]!.click();
      find('dialog.detail .change').click();
      expect([first.screen.upcoming, first.screen.show, first.screen.detail, first.screen.move, first.showWeek].map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0, 0, 0]);
      expect([second.screen.upcoming, second.screen.show, second.screen.detail, second.screen.move, second.showWeek].map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1, 1, 1]);
    });
  });
});
