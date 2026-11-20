import { BehaviorSubject, type Subscription } from 'rxjs';
import type { AppointmentDetail } from '../../../src/logic/appointment.detail';
import type { AppointmentRow } from '../../../src/logic/appointments.model';
import type { ListState } from '../../../src/logic/appointments.screen';
import type { WeekModel } from '../../../src/logic/week.model';
import type { WeekState } from '../../../src/logic/week.screen';
import type { BookState, CancelState, ChangeState, UpdateNoteState } from '../../../src/services/appointments.types';
import type { ListUsersState } from '../../../src/services/users.types';
import { mountAppointments, type AppointmentsDeps } from '../../../src/views/appointments.view';
import { mountDetail, type DetailDeps, type DetailView } from '../../../src/views/detail.view';
import { mountWeek, type WeekDeps } from '../../../src/views/week.view';
import { find, submit, useRealPage } from './page';

// The DOM test of the appointment detail (docs/FRONTEND_ARCHITECTURE.md sections 4 and 8): the
// real index.html, and fakes whose streams the test controls and whose methods are spies. The
// dialog belongs to no screen, so every case runs three times: mounted alone, mounted by the
// week view and mounted by the view of "My appointments", each opening it its own way (a call,
// a click on an appointment of the week, a click on a row of the list). The details are written
// by hand: how they are made is checked in the logic layer's tests.

const SCRIPT = '<script>window.hacked = true</script><b>bold</b>';
const FAILURE = 'The server cannot be reached. Check the connection and try again.';
const APPOINTMENT = '01M6DMQ0000000000000000001';
const OTHER_APPOINTMENT = '01M6DMQ0000000000000000002';

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
const DETAIL_2: AppointmentDetail = {
  ...DETAIL,
  appointmentId: OTHER_APPOINTMENT,
  when: 'Mon 16 Nov, 15:00–16:00',
  typeName: 'Swimming Pool',
  note: '—',
  noteValue: '',
  booked: 'Booked by admin on Fri 13 Nov, 09:00',
};
// What every host shows to click on: these two appointments, whatever details the screen then
// answers for them.
const SHOWN = [APPOINTMENT, OTHER_APPOINTMENT];

// What a test gets from a host: the screen's answer to "the detail of this id" as a spy, the
// fake service with its two streams, the ids "Change" was forwarded with, and the subscription
// that ends the dialog (the host view's own, when a view mounted it).
type Mounted = {
  screen: { detail: ReturnType<typeof vi.fn<DetailDeps['detail']>> };
  appointments: { cancel: ReturnType<typeof vi.fn<DetailDeps['appointments']['cancel']>>; updateNote: ReturnType<typeof vi.fn<DetailDeps['appointments']['updateNote']>> };
  cancelState$: BehaviorSubject<CancelState>;
  updateNoteState$: BehaviorSubject<UpdateNoteState>;
  changed: () => string[];
  subscription: Subscription;
};
type Host = { name: string; mount: (details?: AppointmentDetail[]) => Mounted; open: (index?: number) => void };

function fakes(details: AppointmentDetail[]) {
  const cancelState$ = new BehaviorSubject<CancelState>({ status: 'idle' });
  const updateNoteState$ = new BehaviorSubject<UpdateNoteState>({ status: 'idle' });
  const detail = vi.fn<DetailDeps['detail']>((id) => details.find((one) => one.appointmentId === id) ?? null);
  const appointments = {
    cancelState$: cancelState$.asObservable(),
    updateNoteState$: updateNoteState$.asObservable(),
    cancel: vi.fn<DetailDeps['appointments']['cancel']>(),
    updateNote: vi.fn<DetailDeps['appointments']['updateNote']>(),
  };
  return { cancelState$, updateNoteState$, detail, appointments };
}

// Mounted alone: the test calls `open` itself, on the view mounted last.
let alone: DetailView;
const ALONE: Host = {
  name: 'alone',
  mount: (details = [DETAIL]) => {
    const { cancelState$, updateNoteState$, detail, appointments } = fakes(details);
    const change = vi.fn<DetailDeps['change']>();
    alone = mountDetail(find<HTMLDialogElement>('#detail'), { detail, appointments, change });
    return { screen: { detail }, appointments, cancelState$, updateNoteState$, changed: () => change.mock.calls.map(([id]) => id), subscription: alone.subscription };
  },
  open: (index = 0) => alone.open(SHOWN[index]!),
};

// Mounted by the week view, on a week that holds the two appointments.
const WEEK: WeekModel = {
  timeZone: 'Europe/Rome',
  hours: ['11:00', '12:00'],
  legend: [],
  days: [
    {
      date: '2026-11-16',
      label: 'Mon 16 Nov',
      today: false,
      windows: [],
      slots: [],
      busy: [],
      appointments: SHOWN.map((appointmentId, i) => ({ top: `${i * 50}%`, height: '50%', time: '11:00–12:00', lane: 0, lanes: 1, appointmentId, who: 'You', typeName: 'Studio', note: '', colour: 2 })),
    },
  ],
};
const BY_THE_WEEK: Host = {
  name: 'by the week view',
  mount: (details = [DETAIL]) => {
    const { cancelState$, updateNoteState$, detail, appointments } = fakes(details);
    const move = vi.fn<WeekDeps['screen']['move']>();
    const subscription = mountWeek(find('#week'), {
      screen: {
        week$: new BehaviorSubject<WeekState>({ label: '16 Nov – 22 Nov 2026', loading: false, failure: null, week: WEEK, moving: null }).asObservable(),
        previous: vi.fn(),
        next: vi.fn(),
        today: vi.fn(),
        detail,
        move,
        keep: vi.fn(),
      },
      appointments: {
        ...appointments,
        bookState$: new BehaviorSubject<BookState>({ status: 'idle' }).asObservable(),
        changeState$: new BehaviorSubject<ChangeState>({ status: 'idle' }).asObservable(),
        book: vi.fn(),
        change: vi.fn(),
      },
      users: { listUsersState$: new BehaviorSubject<ListUsersState>({ status: 'idle' }).asObservable(), listUsers: vi.fn() },
      role: 'user',
    });
    return { screen: { detail }, appointments, cancelState$, updateNoteState$, changed: () => move.mock.calls.map(([id]) => id), subscription };
  },
  open: (index = 0) => document.querySelectorAll<HTMLElement>('#week .appointment')[index]!.click(),
};

// Mounted by the view of "My appointments", on a list that holds the two appointments.
const ROWS: AppointmentRow[] = SHOWN.map((appointmentId) => ({ appointmentId, date: 'Mon 16 Nov', time: '11:00–12:00', typeName: 'Studio', note: '', kind: 'booked', status: 'Booked' }));
const BY_THE_LIST: Host = {
  name: 'by the view of "My appointments"',
  mount: (details = [DETAIL]) => {
    const { cancelState$, updateNoteState$, detail, appointments } = fakes(details);
    const move = vi.fn<AppointmentsDeps['screen']['move']>();
    const subscription = mountAppointments(find('#appointments'), {
      screen: {
        list$: new BehaviorSubject<ListState>({ mode: 'upcoming', period: null, loading: false, failure: null, refusal: null, rows: ROWS, empty: null }).asObservable(),
        upcoming: vi.fn(),
        history: vi.fn(),
        show: vi.fn(),
        detail,
        move,
      },
      appointments,
      showWeek: vi.fn(),
    });
    return { screen: { detail }, appointments, cancelState$, updateNoteState$, changed: () => move.mock.calls.map(([id]) => id), subscription };
  },
  open: (index = 0) => document.querySelectorAll<HTMLElement>('#appointments .row')[index]!.click(),
};

const detail = () => find<HTMLDialogElement>('dialog.detail');
const detailError = () => find('dialog.detail .error');
const cancelButton = () => find<HTMLButtonElement>('dialog.detail .cancel');
const changeButton = () => find<HTMLButtonElement>('dialog.detail .change');
const detailText = (field: string) => find(`dialog.detail .${field}`).textContent;
const noteForm = () => find<HTMLFormElement>('dialog.detail .note-form');
const noteField = () => find<HTMLTextAreaElement>('dialog.detail [name="note"]');
const noteSave = () => find<HTMLButtonElement>('dialog.detail .note-form .submit');
const noted = () => find('dialog.detail .noted');
const saved = (): UpdateNoteState => ({ status: 'success', appointment: {} as never });
const html = () => document.documentElement.outerHTML;

describe.each([ALONE, BY_THE_WEEK, BY_THE_LIST])('the appointment detail, mounted $name', ({ mount, open }) => {
  useRealPage();

  it('the dialog is the frame\'s: in no screen, closed, and named by its heading', () => {
    mount();
    expect(detail().open).toBe(false);
    expect(detail().parentElement!.id).toBe('app');
    expect(detail().closest('main')).toBeNull();
    expect(document.getElementById(detail().getAttribute('aria-labelledby')!)!.textContent).toBe('Appointment');
  });

  describe('showing an appointment and cancelling it', () => {
    it('opening an appointment asks the screen for its detail and shows every field', () => {
      const { screen } = mount();
      open();
      expect(screen.detail).toHaveBeenCalledWith(APPOINTMENT);
      expect(detail().open).toBe(true);
      expect(['when', 'typeName', 'who', 'note', 'booked', 'hint'].map(detailText)).toEqual([
        'Mon 16 Nov, 11:00–12:15',
        'Studio',
        'You',
        'First lesson',
        'Booked by you on Thu 12 Nov, 13:24',
        'It can be cancelled until Sun 15 Nov, 11:00.',
      ]);
      expect(detailError().textContent).toBe('');
      expect(detailError().getAttribute('role')).toBe('alert');
    });

    it('"Cancel appointment" is shown when the logic layer offers it, hidden when it does not', () => {
      const offered = mount();
      open();
      expect(cancelButton().hidden).toBe(false);
      expect(cancelButton().disabled).toBe(false);
      offered.subscription.unsubscribe();

      mount([{ ...DETAIL, canCancel: false, hint: 'It is too late to cancel this appointment.' }]);
      open();
      expect(cancelButton().hidden).toBe(true);
      expect(detailText('hint')).toBe('It is too late to cancel this appointment.');
    });

    it('an appointment the screen no longer holds opens nothing', () => {
      const { screen } = mount([]);
      open();
      expect(screen.detail).toHaveBeenCalledTimes(1);
      expect(detail().open).toBe(false);
    });

    it('"Cancel appointment" calls cancel() with the id, once, with no second question, and changes nothing by itself', () => {
      const { appointments } = mount();
      open();
      cancelButton().click();
      expect(appointments.cancel).toHaveBeenCalledTimes(1);
      expect(appointments.cancel).toHaveBeenCalledWith(APPOINTMENT);
      expect(detail().open).toBe(true);
      expect(cancelButton().disabled).toBe(false);
    });

    it('a close event that arrives late, after the dialog was opened again, changes nothing: the appointment is still the one cancelled, its note the one saved, and a success closes the dialog', () => {
      const { appointments, cancelState$ } = mount();
      open();
      detail().close(); // the Escape key
      open(); // opened again at once
      // A browser sends the close event a moment after the close: here, after the new opening.
      detail().dispatchEvent(new Event('close'));
      submit(noteForm());
      expect(appointments.updateNote).toHaveBeenCalledWith(APPOINTMENT, 'First lesson');
      cancelButton().click();
      expect(appointments.cancel).toHaveBeenCalledWith(APPOINTMENT);
      cancelState$.next({ status: 'pending', appointmentId: APPOINTMENT });
      expect(cancelButton().disabled).toBe(true);
      detail().dispatchEvent(new Event('close'));
      cancelState$.next({ status: 'success', appointment: {} as never });
      expect(detail().open).toBe(false);
    });

    it('cancelState$ pending for this appointment disables the button; for another one it does not', () => {
      const { cancelState$ } = mount();
      open();
      cancelState$.next({ status: 'pending', appointmentId: OTHER_APPOINTMENT });
      expect(cancelButton().disabled).toBe(false);
      cancelButton().click();
      cancelState$.next({ status: 'pending', appointmentId: APPOINTMENT });
      expect(cancelButton().disabled).toBe(true);
      expect(detail().open).toBe(true);
    });

    it('cancelState$ success: the dialog closes', () => {
      const { cancelState$ } = mount();
      open();
      cancelButton().click();
      cancelState$.next({ status: 'pending', appointmentId: APPOINTMENT });
      cancelState$.next({ status: 'success', appointment: {} as never });
      expect(detail().open).toBe(false);
    });

    it('cancelState$ failure: the sentence in plain words, the dialog still open, the button usable again', () => {
      const { cancelState$ } = mount();
      open();
      cancelButton().click();
      cancelState$.next({ status: 'pending', appointmentId: APPOINTMENT });
      cancelState$.next({ status: 'failure', reason: 'cancellation_notice_too_short', message: 'cancellation_notice_too_short: 23 h < 24 h' });
      expect(detailError().textContent).toBe('It is too late to cancel this appointment.');
      expect(detail().open).toBe(true);
      expect(cancelButton().disabled).toBe(false);
      expect(document.body.textContent).not.toContain('23 h');
    });

    it('"Close" and the Escape key (close()) close it without a call', () => {
      const { appointments } = mount();
      open();
      find('dialog.detail .close').click();
      expect(detail().open).toBe(false);
      open();
      detail().close();
      expect(detail().open).toBe(false);
      expect(appointments.cancel).not.toHaveBeenCalled();
    });

    it('opened a second time after a failure it shows no failure; one already in the stream is not shown either', () => {
      const { cancelState$ } = mount();
      cancelState$.next({ status: 'failure', reason: 'network', message: 'x' });
      open();
      expect(detailError().textContent).toBe('');
      cancelButton().click();
      cancelState$.next({ status: 'failure', reason: 'concurrent_update', message: 'x' });
      expect(detailError().textContent).toBe('The calendar was being changed at the same moment. Please try again.');
      detail().close();

      open();
      expect(detailError().textContent).toBe('');
    });

    it('a cancellation still under way from an opening that was closed: disabled for the same appointment, and its result is neither shown nor closes the dialog', () => {
      const { cancelState$ } = mount();
      open();
      cancelButton().click();
      cancelState$.next({ status: 'pending', appointmentId: APPOINTMENT });
      detail().close();

      open();
      expect(cancelButton().disabled).toBe(true);
      cancelState$.next({ status: 'success', appointment: {} as never });
      expect(detail().open).toBe(true);
      expect(cancelButton().disabled).toBe(false);
      expect(detailError().textContent).toBe('');
    });
  });

  describe('the note', () => {
    it('while the note can be edited the field holds it, with "Save note"; the text to read is hidden', () => {
      const { appointments } = mount();
      open();
      expect(noteForm().hidden).toBe(false);
      expect(noted().hidden).toBe(true);
      expect(noteField().value).toBe('First lesson');
      expect(noteField().maxLength).toBe(500);
      expect(noteSave().textContent).toBe('Save note');
      expect(noteSave().disabled).toBe(false);
      expect(appointments.updateNote).not.toHaveBeenCalled();
    });

    it('an appointment without a note opens with an empty field, not with the dash', () => {
      mount([DETAIL, DETAIL_2]);
      open(1);
      expect(noteField().value).toBe('');
      expect(noteForm().hidden).toBe(false);
    });

    it('when the note cannot be edited it is shown as text, and there is no field and no button', () => {
      mount([{ ...DETAIL, canEditNote: false, canChange: false, canCancel: false, hint: 'This appointment has ended.' }]);
      open();
      expect(noteForm().hidden).toBe(true);
      expect(noted().hidden).toBe(false);
      expect(detailText('note')).toBe('First lesson');
      expect([changeButton().hidden, cancelButton().hidden]).toEqual([true, true]);
    });

    it('the note stays editable when it is too late to change or cancel', () => {
      mount([{ ...DETAIL, canChange: false, canCancel: false, hint: 'It is too late to change or cancel this appointment.' }]);
      open();
      expect(noteForm().hidden).toBe(false);
      expect([changeButton().hidden, cancelButton().hidden]).toEqual([true, true]);
      expect(detailText('hint')).toBe('It is too late to change or cancel this appointment.');
    });

    it('"Save note" calls updateNote() with the id and the text as typed, once, and changes nothing on screen by itself', () => {
      const { appointments } = mount();
      open();
      noteField().value = ' Second lesson ';
      const { prevented } = submit(noteForm());
      expect(prevented).toBe(true);
      expect(appointments.updateNote).toHaveBeenCalledTimes(1);
      expect(appointments.updateNote).toHaveBeenCalledWith(APPOINTMENT, ' Second lesson ');
      expect(appointments.cancel).not.toHaveBeenCalled();
      expect(detail().open).toBe(true);
      expect(noteSave().disabled).toBe(false);
      expect(noteField().value).toBe(' Second lesson ');
    });

    it('an emptied field is sent as it is, and an unchanged note is sent too', () => {
      const { appointments } = mount();
      open();
      submit(noteForm());
      expect(appointments.updateNote).toHaveBeenLastCalledWith(APPOINTMENT, 'First lesson');
      noteField().value = '';
      submit(noteForm());
      expect(appointments.updateNote).toHaveBeenLastCalledWith(APPOINTMENT, '');
      expect(appointments.updateNote).toHaveBeenCalledTimes(2);
    });

    it('updateNoteState$ pending for this appointment disables "Save note"; for another one it does not', () => {
      const { updateNoteState$ } = mount();
      open();
      updateNoteState$.next({ status: 'pending', appointmentId: OTHER_APPOINTMENT, note: 'x' });
      expect(noteSave().disabled).toBe(false);
      noteField().value = 'Second lesson';
      submit(noteForm());
      updateNoteState$.next({ status: 'pending', appointmentId: APPOINTMENT, note: 'Second lesson' });
      expect(noteSave().disabled).toBe(true);
      expect(cancelButton().disabled).toBe(false);
      expect(detail().open).toBe(true);
      expect(noteField().value).toBe('Second lesson');
      expect(detailError().textContent).toBe('');
    });

    it('updateNoteState$ success: the dialog closes', () => {
      const { updateNoteState$ } = mount();
      open();
      submit(noteForm());
      updateNoteState$.next({ status: 'pending', appointmentId: APPOINTMENT, note: 'First lesson' });
      updateNoteState$.next(saved());
      expect(detail().open).toBe(false);
      expect(noteSave().disabled).toBe(false);
    });

    it('updateNoteState$ failure: the sentence in plain words, the dialog still open with what was typed, "Save note" usable again', () => {
      const { updateNoteState$ } = mount();
      open();
      noteField().value = 'Second lesson';
      submit(noteForm());
      updateNoteState$.next({ status: 'pending', appointmentId: APPOINTMENT, note: 'Second lesson' });
      updateNoteState$.next({ status: 'failure', reason: 'appointment_not_active', message: 'appointment_not_active: ended at 12:15' });
      expect(detailError().textContent).toBe('This appointment has already been cancelled, or it has ended.');
      expect(detail().open).toBe(true);
      expect(noteField().value).toBe('Second lesson');
      expect(noteSave().disabled).toBe(false);
      expect(document.body.textContent).not.toContain('ended at');
    });

    it('a note too long, refused before any request, says to check what was entered', () => {
      const { updateNoteState$ } = mount();
      open();
      submit(noteForm());
      updateNoteState$.next({ status: 'failure', reason: 'invalid_request', message: 'note: at most 500 characters' });
      expect(detailError().textContent).toBe('The request was not accepted. Check what you entered and try again.');
    });

    it('a failure that was already in the stream is not shown at opening; nor a success closes a dialog that did not ask', () => {
      const { updateNoteState$ } = mount();
      updateNoteState$.next({ status: 'failure', reason: 'network', message: 'x' });
      open();
      expect(detailError().textContent).toBe('');
      updateNoteState$.next(saved());
      expect(detail().open).toBe(true);
    });

    it('a save still under way from an opening that was closed: disabled for the same appointment, and its result is neither shown nor closes the dialog', () => {
      const { updateNoteState$ } = mount();
      open();
      submit(noteForm());
      updateNoteState$.next({ status: 'pending', appointmentId: APPOINTMENT, note: 'First lesson' });
      detail().close();

      open();
      expect(noteSave().disabled).toBe(true);
      updateNoteState$.next({ status: 'failure', reason: 'network', message: 'x' });
      expect(detailError().textContent).toBe('');
      expect(noteSave().disabled).toBe(false);
      expect(detail().open).toBe(true);
    });

    it('a cancellation\'s result is not shown as the note\'s, nor the note\'s as the cancellation\'s', () => {
      const { updateNoteState$, cancelState$ } = mount();
      open();
      submit(noteForm());
      cancelState$.next({ status: 'failure', reason: 'cancellation_notice_too_short', message: 'x' });
      expect(detailError().textContent).toBe('');
      cancelState$.next({ status: 'success', appointment: {} as never });
      expect(detail().open).toBe(true);
      detail().close();

      open();
      cancelButton().click();
      updateNoteState$.next({ status: 'failure', reason: 'network', message: 'x' });
      expect(detailError().textContent).toBe('');
      updateNoteState$.next(saved());
      expect(detail().open).toBe(true);
    });

    it('opened a second time, on another appointment, it shows nothing of the first: after a success', () => {
      const { updateNoteState$ } = mount([DETAIL, DETAIL_2]);
      open();
      noteField().value = 'Typed for the first';
      submit(noteForm());
      updateNoteState$.next(saved());
      expect(detail().open).toBe(false);

      open(1);
      expect(detail().open).toBe(true);
      expect(noteField().value).toBe('');
      expect(detailError().textContent).toBe('');
      expect(['when', 'typeName', 'booked'].map(detailText)).toEqual(['Mon 16 Nov, 15:00–16:00', 'Swimming Pool', 'Booked by admin on Fri 13 Nov, 09:00']);
      expect(find('dialog.detail').textContent).not.toContain('First lesson');
      // And its "Save note" is the second one's.
      const { appointments } = mount([DETAIL, DETAIL_2]);
      open(1);
      submit(noteForm());
      expect(appointments.updateNote).toHaveBeenCalledWith(OTHER_APPOINTMENT, '');
    });

    it('opened a second time, on another appointment, it shows nothing of the first: after a failure', () => {
      const { updateNoteState$ } = mount([DETAIL, DETAIL_2]);
      open();
      noteField().value = 'Typed for the first';
      submit(noteForm());
      updateNoteState$.next({ status: 'failure', reason: 'network', message: 'x' });
      expect(detailError().textContent).toBe(FAILURE);
      detail().close();

      open(1);
      expect(noteField().value).toBe('');
      expect(detailError().textContent).toBe('');
      expect(noteSave().disabled).toBe(false);
      // The first one, opened again, has its own note back, not what was typed.
      detail().close();
      open();
      expect(noteField().value).toBe('First lesson');
    });

    it('a note containing <script> is put in the field as text and shown as text', () => {
      mount([{ ...DETAIL, note: SCRIPT, noteValue: SCRIPT }]);
      open();
      expect(noteField().value).toBe(SCRIPT);
      expect(noteField().children).toHaveLength(0);
      expect(find('dialog.detail .note').textContent).toBe(SCRIPT);
      expect(find('dialog.detail .note').children).toHaveLength(0);
      expect(document.querySelectorAll('script, b')).toHaveLength(0);
    });
  });

  describe('"Change"', () => {
    it('is shown when the logic layer offers it, hidden when it does not', () => {
      const offered = mount();
      open();
      expect(changeButton().hidden).toBe(false);
      expect(changeButton().textContent).toBe('Change');
      offered.subscription.unsubscribe();

      mount([{ ...DETAIL, canChange: false }]);
      open();
      expect(changeButton().hidden).toBe(true);
    });

    it('closes the dialog and forwards the id to the screen that mounted it, once, and calls no service', () => {
      const { appointments, changed } = mount();
      open();
      changeButton().click();
      expect(detail().open).toBe(false);
      expect(changed()).toEqual([APPOINTMENT]);
      expect(appointments.cancel).not.toHaveBeenCalled();
      expect(appointments.updateNote).not.toHaveBeenCalled();
    });

    it('forwards the id of the appointment shown, not of one shown before', () => {
      const { changed } = mount([DETAIL, DETAIL_2]);
      open();
      detail().close();
      open(1);
      changeButton().click();
      expect(changed()).toEqual([OTHER_APPOINTMENT]);
    });
  });

  it('every text containing <script> is shown as text', () => {
    mount([{ ...DETAIL, when: SCRIPT, typeName: SCRIPT, who: SCRIPT, note: SCRIPT, booked: SCRIPT, hint: SCRIPT, canEditNote: false }]);
    open();
    for (const field of ['when', 'typeName', 'who', 'note', 'booked', 'hint']) {
      const element = find(`dialog.detail .${field}`);
      expect(element.textContent, field).toBe(SCRIPT);
      expect(element.children, field).toHaveLength(0);
    }
    expect(document.querySelectorAll('script, b')).toHaveLength(0);
  });

  describe('leaving', () => {
    it('with the dialog open after a failed cancellation: closed, emptied, and the page as index.html has it', () => {
      const before = html();
      const { subscription, cancelState$ } = mount();
      open();
      cancelButton().click();
      cancelState$.next({ status: 'pending', appointmentId: APPOINTMENT });
      expect(cancelButton().disabled).toBe(true);
      cancelState$.next({ status: 'failure', reason: 'network', message: 'TypeError: Failed to fetch' });
      expect(detail().open).toBe(true);
      expect(detailError().textContent).toBe(FAILURE);

      subscription.unsubscribe();
      expect(detail().open).toBe(false);
      expect(detail().textContent).not.toContain('First lesson');
      expect(detailError().textContent).toBe('');
      expect(cancelButton().hidden).toBe(true);
      expect(html()).not.toContain('First lesson');
      expect(html()).toBe(before);
    });

    it('with a note typed and a save under way: closed, the field emptied, the buttons as index.html has them', () => {
      const before = html();
      const { subscription, updateNoteState$ } = mount();
      open();
      noteField().value = 'A private note';
      submit(noteForm());
      updateNoteState$.next({ status: 'pending', appointmentId: APPOINTMENT, note: 'A private note' });
      expect(noteSave().disabled).toBe(true);

      subscription.unsubscribe();
      expect(detail().open).toBe(false);
      expect(noteField().value).toBe('');
      expect([noteForm().hidden, noted().hidden, changeButton().hidden, cancelButton().hidden, noteSave().disabled, cancelButton().disabled]).toEqual([true, false, true, true, false, false]);
      expect(html()).toBe(before);
    });

    it('the two streams are no longer heard', () => {
      const { subscription, cancelState$, updateNoteState$ } = mount();
      subscription.unsubscribe();
      expect([cancelState$.observed, updateNoteState$.observed]).toEqual([false, false]);
    });

    it('mounted again, the dialog reaches the new objects only', () => {
      const first = mount();
      first.subscription.unsubscribe();
      const second = mount([{ ...DETAIL, appointmentId: OTHER_APPOINTMENT }]);
      open(1);
      submit(noteForm());
      cancelButton().click();
      changeButton().click();
      expect([first.screen.detail, first.appointments.updateNote, first.appointments.cancel].map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0]);
      expect(first.changed()).toEqual([]);
      expect(second.appointments.updateNote).toHaveBeenCalledWith(OTHER_APPOINTMENT, 'First lesson');
      expect(second.appointments.cancel).toHaveBeenCalledWith(OTHER_APPOINTMENT);
      expect(second.changed()).toEqual([OTHER_APPOINTMENT]);
    });
  });
});
