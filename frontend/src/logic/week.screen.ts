import { addDays, DEFAULT_TIME_ZONE, localDateOf, weekdayOf, type CalendarView, type Role } from '@shared-calendar/shared';
import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import type { AppointmentsService } from '../services/appointments.service';
import type { CalendarService } from '../services/calendar.service';
import { appointmentDetail, movingOf, type AppointmentDetail, type Moving } from './appointment.detail';
import { refusalOf, type Asked, type Refusal } from './booking';
import { failureText, weekLabel } from './texts';
import { weekModel, type WeekModel } from './week.model';

// The week screen (docs/FRONTEND_ARCHITECTURE.md section 5): which week is on screen, its load
// at every change of week, the last week loaded kept while the next one loads or fails, the
// same week loaded again after every write to an appointment and every time the page becomes
// visible, and the appointment that is being moved to another time, if any: one of the week on
// screen, or one that another screen handed over. Shaped like a service: one public stream,
// `void` methods, nothing started by the constructor.

// What the week view shows. `week` is the last one loaded, whichever week `label` names;
// `failure` is the last load's failure in plain words, until a load succeeds; `moving` is the
// appointment being moved to another time, in words, or null.
export type WeekState = { label: string; loading: boolean; failure: string | null; week: WeekModel | null; moving: Moving | null };

// What the screen uses of the CalendarService.
export type WeekCalendar = Pick<CalendarService, 'load' | 'reload' | 'calendarState$'>;
// What it uses of the AppointmentsService: the results of the four writes that change a week.
export type WeekAppointments = Pick<AppointmentsService, 'bookResult$' | 'cancelResult$' | 'updateNoteResult$' | 'changeResult$'>;

const mondayOf = (date: string) => addDays(date, 1 - weekdayOf(date));

export class WeekScreen {
  private monday: string;
  private started = false;
  // The last calendar view loaded, as received: where `detail` finds an appointment.
  private view: CalendarView | null = null;
  // An appointment another screen handed over to be moved, with the Monday of its week, until
  // it is taken.
  private handed: { moving: Moving; monday: string } | null = null;
  private readonly state: BehaviorSubject<WeekState>;
  readonly week$: Observable<WeekState>;

  // `now` gives the present moment: nothing here reads the clock by itself. `visible$` notifies
  // each time the page becomes visible again: the logic layer has no document to ask
  // (docs/FRONTEND_ARCHITECTURE.md section 5, rule 1).
  constructor(
    private readonly calendar: WeekCalendar,
    private readonly appointments: WeekAppointments,
    private readonly role: Role,
    private readonly now: () => Date,
    private readonly visible$: Observable<unknown>,
  ) {
    this.monday = this.thisMonday();
    this.state = new BehaviorSubject<WeekState>({ label: this.label(), loading: false, failure: null, week: null, moving: null });
    this.week$ = this.state.asObservable();
  }

  // Called once the view has subscribed (docs/FRONTEND_ARCHITECTURE.md section 5, rule 5): loads
  // the week on screen, and from then on every week the person moves to, until the subscription
  // returned ends. Until then it also loads the week on screen again:
  // - at every result of a booking, of a cancellation, of a change or of a note saved, a
  //   failure included, whatever its reason: after a failed write the server may still have
  //   applied it (docs/SHARED_CALENDAR_SPEC.md section 16.3);
  // - every time the page becomes visible, so that what other people booked or cancelled in the
  //   meantime is shown.
  // A change that succeeds also ends the move; so does the end of the subscription.
  // An appointment handed over since the screen was last on show is taken here: the week
  // loaded is its week, and it is being moved.
  start(): Subscription {
    const subscription = this.calendar.calendarState$.subscribe((state) => {
      const shown = this.state.getValue();
      if (state.status === 'pending') this.state.next({ ...shown, label: this.label(), loading: true });
      if (state.status === 'failure') this.state.next({ ...shown, loading: false, failure: failureText(state.reason) });
      if (state.status === 'success') {
        this.view = state.calendar;
        this.state.next({ ...shown, label: this.label(), loading: false, failure: null, week: weekModel(state.calendar, this.role) });
      }
    });
    this.started = true;
    subscription.add(() => {
      this.started = false;
      this.keep();
    });
    this.take();
    this.load();

    // A result stream hands its last result to a new subscriber at once: that one came before
    // this start and loads nothing again. Only those that arrive later do.
    let live = false;
    const again = () => {
      if (live) this.calendar.reload();
    };
    subscription.add(this.appointments.bookResult$.subscribe(again));
    subscription.add(this.appointments.cancelResult$.subscribe(again));
    subscription.add(this.appointments.updateNoteResult$.subscribe(again));
    // The move ends because the change was made, whoever asked for it; a refused change leaves
    // it, whatever the reason, and the person gives up with `keep`.
    subscription.add(
      this.appointments.changeResult$.subscribe((result) => {
        if (live && result.status === 'success') this.keep();
        again();
      }),
    );
    subscription.add(this.visible$.subscribe(again));
    live = true;
    return subscription;
  }

  // The appointment `appointmentId` of the last week loaded, ready for the detail dialog, with
  // what can be done to it at this moment; null when that week does not hold it.
  detail(appointmentId: string): AppointmentDetail | null {
    const appointment = this.view?.appointments.find((a) => a.appointmentId === appointmentId);
    return appointment ? appointmentDetail(appointment, this.role, this.now(), this.view!.timeZone) : null;
  }

  // What the book dialog says when the server refused what it `asked`, the appointment in the
  // way looked for among those of the last week loaded.
  refusal(reason: string, asked: Asked): Refusal {
    return refusalOf(reason, asked, this.role, this.view?.appointments ?? []);
  }

  // Starts the move of the appointment `appointmentId` of the last week loaded to another
  // time: from now on `week$` names it, in words copied at this moment, whichever week is on
  // screen. Nothing starts for an appointment that week does not hold or that cannot be
  // changed at this moment, nor while the screen is not started.
  move(appointmentId: string): void {
    const detail = this.started ? this.detail(appointmentId) : null;
    if (detail?.canChange) this.state.next({ ...this.state.getValue(), moving: movingOf(detail, this.role) });
  }

  // Another screen hands over an appointment to move to another time: `moving` is its copy in
  // words, made by that screen, and `date` its local date. The week screen takes it at its next
  // `start()`, or at once when it is started: it goes to the week of that date and is moving
  // the appointment from then on, as after `move`. It is taken once: the move it starts ends
  // like any other, and a later `start()` moves nothing.
  handOver(moving: Moving, date: string): void {
    this.handed = { moving, monday: mondayOf(date) };
    if (!this.started) return;
    this.take();
    this.load();
  }

  // Ends the move and leaves the appointment as it is.
  keep(): void {
    const shown = this.state.getValue();
    if (shown.moving !== null) this.state.next({ ...shown, moving: null });
  }

  previous(): void {
    this.show(addDays(this.monday, -7));
  }
  next(): void {
    this.show(addDays(this.monday, 7));
  }
  // Back to the week of today, loaded again even when it is the one on screen.
  today(): void {
    this.show(this.thisMonday());
  }

  // The Monday of the week of "now". This is the one place where the default time zone stands
  // for the calendar's: the screen opens before any answer has named the real one
  // (docs/FRONTEND_ARCHITECTURE.md section 5).
  private thisMonday(): string {
    return mondayOf(localDateOf(this.now().toISOString(), DEFAULT_TIME_ZONE));
  }

  // Takes what was handed over, if anything: its week becomes the one on screen, and the
  // stream names the appointment being moved.
  private take(): void {
    if (this.handed === null) return;
    this.monday = this.handed.monday;
    this.state.next({ ...this.state.getValue(), label: this.label(), moving: this.handed.moving });
    this.handed = null;
  }

  private label(): string {
    return weekLabel(this.monday, addDays(this.monday, 6));
  }

  // Once started, the load's own "pending" brings the new label with `loading`, in one
  // notification; before that only the label changes.
  private show(monday: string): void {
    this.monday = monday;
    if (this.started) this.load();
    else this.state.next({ ...this.state.getValue(), label: this.label() });
  }

  private load(): void {
    this.calendar.load(this.monday, addDays(this.monday, 6));
  }
}
