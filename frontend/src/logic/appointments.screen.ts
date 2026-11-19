import type { Appointment, Role } from '@shared-calendar/shared';
import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import type { AppointmentsService } from '../services/appointments.service';
import type { CalendarSettingsService } from '../services/calendar-settings.service';
import { appointmentDetail, movingOf, type AppointmentDetail } from './appointment.detail';
import { appointmentRows, defaultPeriod, emptyText, periodRefusal, type AppointmentRow, type Mode, type Period } from './appointments.model';
import { failureText } from './texts';
import type { WeekScreen } from './week.screen';

// The screen "My appointments" (docs/FRONTEND_ARCHITECTURE.md section 5.1): which of its two
// lists is on show, upcoming or history, the period of the history, the calendar's time zone
// read from the settings before the first list, the loads, and the same list loaded again after
// a cancellation or a note saved and every time the page becomes visible. Shaped like a
// service: one public stream, `void` methods, nothing started by the constructor.

// What the list's view shows. `period` is the history's, as the form holds it: null until the
// history is first chosen, and another object only when another period is accepted. `rows` is
// the last list loaded for the mode and the period on show, null until there is one; `empty` is
// the sentence of a list with no row. `failure` is the last load's failure in plain words,
// until a load succeeds; `refusal` says why the period typed was not asked for.
export type ListState = {
  mode: Mode;
  period: Period | null;
  loading: boolean;
  failure: string | null;
  refusal: string | null;
  rows: readonly AppointmentRow[] | null;
  empty: string | null;
};

// What the screen uses of the CalendarSettingsService: the read, for the time zone only.
export type ListSettings = Pick<CalendarSettingsService, 'load' | 'settingsResult$'>;
// What it uses of the AppointmentsService: the list, and the results of the two writes the
// detail makes from this screen.
export type ListAppointments = Pick<AppointmentsService, 'list' | 'appointmentsResult$' | 'cancelResult$' | 'updateNoteResult$'>;
// What it uses of the WeekScreen: an appointment to move is handed over to it.
export type ListWeek = Pick<WeekScreen, 'handOver'>;

export class AppointmentsScreen {
  private mode: Mode = 'upcoming';
  private period: Period | null = null;
  private started = false;
  // The calendar's time zone, known between the answer of the settings and the end of the
  // subscription of `start()`: every date and time of the list is read in it.
  private zone: string | null = null;
  // The last list loaded, as received: where `detail` finds an appointment.
  private loaded: readonly Appointment[] = [];
  private readonly state = new BehaviorSubject<ListState>({
    mode: 'upcoming',
    period: null,
    loading: false,
    failure: null,
    refusal: null,
    rows: null,
    empty: null,
  });
  readonly list$: Observable<ListState> = this.state.asObservable();

  // `now` gives the present moment and `visible$` notifies each time the page becomes visible
  // again: nothing here reads the clock or the document by itself
  // (docs/FRONTEND_ARCHITECTURE.md section 5, rule 1).
  constructor(
    private readonly settings: ListSettings,
    private readonly appointments: ListAppointments,
    private readonly week: ListWeek,
    private readonly role: Role,
    private readonly now: () => Date,
    private readonly visible$: Observable<unknown>,
  ) {}

  // Called once the view has subscribed (docs/FRONTEND_ARCHITECTURE.md section 5, rule 5): reads
  // the settings for the calendar's time zone, then loads the list of the mode and the period
  // the screen is on, and from then on every list the person chooses, until the subscription
  // returned ends. Until then it also loads the list on show again:
  // - at every result of a cancellation or of a note saved, a failure included: after a failed
  //   write the server may still have applied it (docs/SHARED_CALENDAR_SPEC.md section 16.3);
  // - every time the page becomes visible.
  // The end of the subscription forgets the zone and the list, and keeps the mode and the
  // period.
  start(): Subscription {
    // A result stream hands its last result to a new subscriber at once: that one came before
    // this start and is not heard. Only those that arrive later are.
    let live = false;
    const subscription = this.settings.settingsResult$.subscribe((result) => {
      if (!live) return;
      if (result.status === 'failure') {
        this.patch({ loading: false, failure: failureText(result.reason) });
        return;
      }
      this.zone = result.settings.timeZone;
      this.load();
    });
    subscription.add(
      this.appointments.appointmentsResult$.subscribe((result) => {
        // Without a zone no list was asked for since this start: the answer is an earlier one's.
        if (!live || this.zone === null) return;
        if (result.status === 'failure') {
          this.patch({ loading: false, failure: failureText(result.reason) });
          return;
        }
        this.loaded = result.appointments;
        const rows = appointmentRows(result.appointments, this.now(), this.zone);
        this.patch({ loading: false, failure: null, rows, empty: rows.length === 0 ? emptyText(this.mode) : null });
      }),
    );
    const again = () => {
      if (live) this.load();
    };
    subscription.add(this.appointments.cancelResult$.subscribe(again));
    subscription.add(this.appointments.updateNoteResult$.subscribe(again));
    subscription.add(this.visible$.subscribe(again));
    subscription.add(() => {
      this.started = false;
      this.zone = null;
      this.loaded = [];
      this.patch({ loading: false, failure: null, refusal: null, rows: null, empty: null });
    });
    live = true;
    this.started = true;
    this.load();
    return subscription;
  }

  // The appointments still to come. Chosen again while it is on show, it is loaded again.
  upcoming(): void {
    this.choose('upcoming', this.period);
  }

  // The history, over the period it was left on; the first time, over the default one.
  history(): void {
    this.choose('history', this.period);
  }

  // The history over the period typed in the form, when it can be asked for; otherwise why
  // not, with no call and the list as it is.
  show(from: string, to: string): void {
    const refusal = periodRefusal(from, to);
    if (refusal !== null) {
      this.patch({ refusal });
      return;
    }
    const same = this.period !== null && this.period.from === from && this.period.to === to;
    this.choose('history', same ? this.period : { from, to });
  }

  // The appointment `appointmentId` of the last list loaded, ready for the detail dialog, with
  // what can be done to it at this moment; null when that list does not hold it.
  detail(appointmentId: string): AppointmentDetail | null {
    const appointment = this.loaded.find((a) => a.appointmentId === appointmentId);
    // A list is held only while the zone is known.
    return appointment ? appointmentDetail(appointment, this.role, this.now(), this.zone!) : null;
  }

  // Hands the appointment `appointmentId` of the last list loaded over to the week screen, to
  // be moved to another time there: with its words, made here in the calendar's zone, and its
  // date, for the week to open on. Nothing is handed over for an appointment the list does not
  // hold or that cannot be changed at this moment.
  move(appointmentId: string): void {
    const appointment = this.loaded.find((a) => a.appointmentId === appointmentId);
    const detail = this.detail(appointmentId);
    if (appointment && detail?.canChange) this.week.handOver(movingOf(detail, this.role), appointment.date);
  }

  // Another mode or another period forgets the list on show, which is not theirs; the same
  // ones keep it while it is loaded again.
  private choose(mode: Mode, period: Period | null): void {
    const another = mode !== this.mode || period !== this.period;
    this.mode = mode;
    this.period = period;
    if (another) this.loaded = [];
    this.load(another ? { refusal: null, rows: null, empty: null } : { refusal: null });
  }

  // Loads the list of the mode and the period the screen is on, or first the settings while the
  // zone is not known: their answer loads the list. Before `start()` and after the end of its
  // subscription only the state changes.
  private load(change: Partial<ListState> = {}): void {
    if (this.started && this.zone !== null && this.mode === 'history' && this.period === null) {
      this.period = defaultPeriod(this.now(), this.zone);
    }
    this.patch({ ...change, mode: this.mode, period: this.period, loading: this.started });
    if (!this.started) return;
    if (this.zone === null) this.settings.load();
    else if (this.mode === 'upcoming') this.appointments.list({ upcoming: 'true' });
    else this.appointments.list({ from: this.period!.from, to: this.period!.to, status: 'all' });
  }

  private patch(change: Partial<ListState>): void {
    this.state.next({ ...this.state.getValue(), ...change });
  }
}
