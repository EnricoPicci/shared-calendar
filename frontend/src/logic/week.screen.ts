import { addDays, DEFAULT_TIME_ZONE, localDateOf, weekdayOf, type Role } from '@shared-calendar/shared';
import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import type { CalendarService } from '../services/calendar.service';
import { failureText, weekLabel } from './texts';
import { weekModel, type WeekModel } from './week.model';

// The week screen (docs/FRONTEND_ARCHITECTURE.md section 5): which week is on screen, its load
// at every change of week, and the last week loaded kept while the next one loads or fails.
// Shaped like a service: one public stream, `void` methods, nothing started by the constructor.

// What the week view shows. `week` is the last one loaded, whichever week `label` names;
// `failure` is the last load's failure in plain words, until a load succeeds.
export type WeekState = { label: string; loading: boolean; failure: string | null; week: WeekModel | null };

// What the screen uses of the CalendarService.
export type WeekCalendar = Pick<CalendarService, 'load' | 'calendarState$'>;

const mondayOf = (date: string) => addDays(date, 1 - weekdayOf(date));

export class WeekScreen {
  private monday: string;
  private started = false;
  private readonly state: BehaviorSubject<WeekState>;
  readonly week$: Observable<WeekState>;

  // `now` gives the present moment: nothing here reads the clock by itself.
  constructor(
    private readonly calendar: WeekCalendar,
    private readonly role: Role,
    private readonly now: () => Date,
  ) {
    this.monday = this.thisMonday();
    this.state = new BehaviorSubject<WeekState>({ label: this.label(), loading: false, failure: null, week: null });
    this.week$ = this.state.asObservable();
  }

  // Called once the view has subscribed (docs/FRONTEND_ARCHITECTURE.md section 5, rule 5): loads
  // the week on screen, and from then on every week the person moves to, until the subscription
  // returned ends.
  start(): Subscription {
    const subscription = this.calendar.calendarState$.subscribe((state) => {
      const shown = this.state.getValue();
      if (state.status === 'pending') this.state.next({ ...shown, label: this.label(), loading: true });
      if (state.status === 'failure') this.state.next({ ...shown, loading: false, failure: failureText(state.reason) });
      if (state.status === 'success') {
        this.state.next({ label: this.label(), loading: false, failure: null, week: weekModel(state.calendar, this.role) });
      }
    });
    this.started = true;
    subscription.add(() => {
      this.started = false;
    });
    this.load();
    return subscription;
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
