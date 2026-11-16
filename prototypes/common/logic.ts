import { BehaviorSubject, combineLatest, merge, type Observable, type Subscription } from 'rxjs';
import { map, scan } from 'rxjs/operators';
import {
  addDays,
  DEFAULT_TIME_ZONE,
  localDateOf,
  localTimeOf,
  weekdayOf,
  type Appointment,
  type BookBody,
  type CalendarView,
  type Role,
} from '@shared-calendar/shared';
import type { AppointmentsService } from '../../frontend/src/services/appointments.service';
import type { CalendarService } from '../../frontend/src/services/calendar.service';
import type { CalendarState } from '../../frontend/src/services/calendar.types';

// The logic between the services and the views (docs/FRONTEND_VIEW_OPTIONS.md section 9, point H1):
// which week is on screen, when the calendar is reloaded, where a block sits in its day, the texts.
// Plain TypeScript with no DOM, shared by both prototypes, so that the two views differ only in
// how they put this on the screen.

// ── What the views draw ──────────────────────────────────────────────────────────────────────

// A block's place in its day column, as CSS percentages, and its times as text ("09:00–10:00").
export type Placed = { top: string; height: string; time: string };
export type WindowBlock = Placed & { typeName: string; colour: number };
export type SlotBlock = Placed & { start: string; day: string; typeName: string; colour: number };
export type AppointmentBlock = Placed & {
  appointmentId: string;
  day: string;
  who: string; // the username for the Administrator, "You" for a User
  typeName: string;
  note: string;
  colour: number;
  canCancel: boolean;
  cancelHint: string;
};
export type DayModel = {
  date: string;
  label: string; // "Mon 16 Nov"
  today: boolean;
  windows: WindowBlock[];
  slots: SlotBlock[];
  busy: Placed[];
  appointments: AppointmentBlock[];
};
export type WeekModel = {
  timeZone: string;
  hours: string[]; // the labels of the time axis, one per hour shown: "08:00", "09:00", …
  types: { name: string; colour: number }[];
  days: DayModel[];
};
// What the calendar screen shows. `week` stays the last one loaded while the next is loading.
export type WeekState = { label: string; loading: boolean; error: string | null; week: WeekModel | null };

// ── Dates and texts ──────────────────────────────────────────────────────────────────────────

const COLOURS = 6; // the number of type colours the style sheet defines
const pad = (n: number) => String(n).padStart(2, '0');

// A local date as text. The date is read as UTC so that the browser's own zone plays no part.
const dateText = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(new Date(`${date}T00:00:00Z`));
const dayLabel = (date: string) => dateText(date, { weekday: 'short', day: 'numeric', month: 'short' });
const weekLabel = (monday: string) =>
  `${dateText(monday, { day: 'numeric', month: 'short' })} – ${dateText(addDays(monday, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`;

const mondayOf = (date: string) => addDays(date, 1 - weekdayOf(date));
// The prototype takes "today" in the default zone; the real one would read the calendar's zone
// from the settings first.
const today = () => localDateOf(new Date().toISOString(), DEFAULT_TIME_ZONE);

// The same colour for a type in every week: a number from its id.
const colourOf = (typeId: string) => [...typeId].reduce((sum, c) => sum + c.charCodeAt(0), 0) % COLOURS;

// Minutes from the day's midnight of an instant, clamped to the day (a window may end at 24:00).
function minuteOf(instant: string, date: string, zone: string): number {
  const local = localDateOf(instant, zone);
  if (local < date) return 0;
  if (local > date) return 24 * 60;
  const time = localTimeOf(instant, zone);
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

// ── The week, ready to draw ──────────────────────────────────────────────────────────────────

export function weekModel(view: CalendarView, role: Role): WeekModel {
  const zone = view.timeZone;
  const appointmentsOf = (date: string) => view.appointments.filter((a) => a.date === date);

  // The hours shown: 08:00–18:00, widened to whole hours to hold everything in the week.
  const spans = view.days.flatMap((day) =>
    [...day.windows, ...day.busy, ...appointmentsOf(day.date)].map((i) => [minuteOf(i.start, day.date, zone), minuteOf(i.end, day.date, zone)] as const),
  );
  const first = Math.floor(Math.min(8 * 60, ...spans.map(([start]) => start)) / 60) * 60;
  const last = Math.ceil(Math.max(18 * 60, ...spans.map(([, end]) => end)) / 60) * 60;

  const placed = (interval: { start: string; end: string }, date: string): Placed => {
    const start = minuteOf(interval.start, date, zone);
    const end = minuteOf(interval.end, date, zone);
    return {
      top: `${((start - first) / (last - first)) * 100}%`,
      height: `${((end - start) / (last - first)) * 100}%`,
      time: `${localTimeOf(interval.start, zone)}–${localTimeOf(interval.end, zone)}`,
    };
  };

  const typeNames = new Map<string, string>();
  for (const day of view.days) for (const w of day.windows) typeNames.set(w.typeId, w.typeName);
  for (const a of view.appointments) typeNames.set(a.typeId, a.typeName);

  const appointmentBlock = (a: Appointment): AppointmentBlock => {
    // The Administrator may cancel until the end; a User until `cancellableUntil`.
    const limit = role === 'admin' ? a.end : a.cancellableUntil;
    const canCancel = limit !== null && view.generatedAt < limit;
    const until = a.cancellableUntil === null ? '' : `${dayLabel(localDateOf(a.cancellableUntil, zone))} ${localTimeOf(a.cancellableUntil, zone)}`;
    return {
      ...placed(a, a.date),
      appointmentId: a.appointmentId,
      day: dayLabel(a.date),
      who: role === 'admin' ? a.username : 'You',
      typeName: a.typeName,
      note: a.note ?? '',
      colour: colourOf(a.typeId),
      canCancel,
      cancelHint: role === 'admin' ? '' : canCancel ? `Can be cancelled until ${until}.` : 'It is too late to cancel this appointment.',
    };
  };

  return {
    timeZone: zone,
    hours: Array.from({ length: (last - first) / 60 }, (_, i) => `${pad(first / 60 + i)}:00`),
    types: [...typeNames].map(([typeId, name]) => ({ name, colour: colourOf(typeId) })).sort((a, b) => a.name.localeCompare(b.name)),
    days: view.days.map((day) => ({
      date: day.date,
      label: dayLabel(day.date),
      today: day.date === localDateOf(view.generatedAt, zone),
      windows: day.windows.map((w) => ({ ...placed(w, day.date), typeName: w.typeName, colour: colourOf(w.typeId) })),
      slots: day.slots.map((s) => ({
        ...placed(s, day.date),
        start: s.start,
        day: dayLabel(day.date),
        typeName: typeNames.get(s.typeId) ?? '',
        colour: colourOf(s.typeId),
      })),
      busy: day.busy.map((b) => placed(b, day.date)),
      appointments: appointmentsOf(day.date).map(appointmentBlock),
    })),
  };
}

// ── The calendar screen: which week, and when it is loaded again ─────────────────────────────

export class WeekScreen {
  private readonly monday = new BehaviorSubject<string>(mondayOf(today()));
  readonly week$: Observable<WeekState>;

  constructor(
    private readonly calendar: CalendarService,
    private readonly appointments: AppointmentsService,
    role: Role,
  ) {
    const loaded$ = calendar.calendarState$.pipe(
      scan(
        (shown, state: CalendarState) => {
          if (state.status === 'success') return { loading: false, error: null, week: weekModel(state.calendar, role) };
          if (state.status === 'failure') return { ...shown, loading: false, error: explain(state) };
          return { ...shown, loading: state.status === 'pending' };
        },
        { loading: false, error: null as string | null, week: null as WeekModel | null },
      ),
    );
    this.week$ = combineLatest([this.monday, loaded$]).pipe(map(([monday, loaded]) => ({ label: weekLabel(monday), ...loaded })));
  }

  // Called once the view has subscribed: loads the week on screen, again at every change of week
  // and after every booking or cancellation, whatever its outcome (the server may have applied a
  // write whose answer was lost).
  start(): Subscription {
    const subscription = this.monday.subscribe((monday) => this.calendar.load(monday, addDays(monday, 6)));
    subscription.add(merge(this.appointments.bookResult$, this.appointments.cancelResult$).subscribe(() => this.calendar.reload()));
    return subscription;
  }

  previous(): void {
    this.monday.next(addDays(this.monday.getValue(), -7));
  }
  next(): void {
    this.monday.next(addDays(this.monday.getValue(), 7));
  }
  today(): void {
    this.monday.next(mondayOf(today()));
  }
}

// ── From the user's input to a service call, and from a failure to plain words ───────────────

// The booking of a free slot: one hour from its start. A blank note and no username are left out.
export function bookingFor(slot: SlotBlock, note: string, username: string): BookBody {
  return { start: slot.start, ...(note.trim() === '' ? {} : { note: note.trim() }), ...(username === '' ? {} : { username }) };
}

const PLAIN_WORDS: Record<string, string> = {
  slot_taken: 'This slot has just been taken. The calendar has been refreshed.',
  booking_in_past: 'This slot is in the past.',
  booking_notice_too_short: 'It is too late to book this slot.',
  booking_beyond_horizon: 'This slot is too far ahead to be booked yet.',
  appointment_limit_reached: 'The maximum number of future appointments has been reached.',
  cancellation_notice_too_short: 'It is too late to cancel this appointment.',
  appointment_not_active: 'This appointment has already been cancelled.',
  concurrent_update: 'The calendar was busy. Please try again.',
  network: 'The server cannot be reached. Please check the connection and try again.',
};
export function explain(failure: { reason: string; message: string }): string {
  return PLAIN_WORDS[failure.reason] ?? failure.message;
}
