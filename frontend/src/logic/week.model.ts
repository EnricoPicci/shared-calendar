import { effectiveWindows, localDateOf, localTimeOf, type CalendarView, type Role } from '@shared-calendar/shared';
import { dateText, offsetChangesOn, rangeText } from './texts';

// The week ready to draw (docs/FRONTEND_ARCHITECTURE.md section 5): what GET /calendar answers
// (docs/SHARED_CALENDAR_SPEC.md section 11.6) turned into days of blocks, each with its place in
// the day and its time as text, so that the view does no arithmetic. Pure: everything comes from
// the view received, its `generatedAt` and its time zone included.

// A block's place in its day column, as CSS percentages of the hours shown, and its times as
// text. `lanes` is 2 for two blocks of the same kind that the clock puts in the same place (the
// hour repeated on the night the clocks go back): each takes half the width, the earlier one
// (`lane` 0) on the left.
export type Placed = { top: string; height: string; time: string; lane: 0 | 1; lanes: 1 | 2 };
// `colour` is one of the type colours the style sheet defines: the class `type-<colour>`.
export type WindowBlock = Placed & { typeName: string; colour: number };
// A free slot also carries what the book dialog needs: its own instants, its day in words, its
// type's name, and the instants of the window that holds it, between which the Administrator
// may choose other times (docs/SHARED_CALENDAR_SPEC.md R-BOOK-08).
export type SlotBlock = Placed & {
  colour: number;
  start: string;
  end: string;
  day: string; // "Mon 16 Nov"
  typeName: string;
  window: { start: string; end: string };
};
export type BusyBlock = Placed;
export type AppointmentBlock = Placed & {
  appointmentId: string; // what the detail dialog is opened with
  who: string; // the User's name for the Administrator, "You" for a User
  typeName: string;
  note: string; // '' when there is none
  colour: number;
};
export type DayModel = {
  date: string;
  label: string; // "Mon 16 Nov"
  today: boolean;
  windows: WindowBlock[];
  slots: SlotBlock[];
  busy: BusyBlock[];
  appointments: AppointmentBlock[];
};
export type WeekModel = {
  timeZone: string;
  hours: string[]; // one label per hour shown, from the top: "08:00", "09:00", …
  legend: { name: string; colour: number }[]; // the types met in the week, by name
  days: DayModel[];
};

const COLOURS = 6; // the type colours of the style sheet: type-0 … type-5
const DAY_MINUTES = 24 * 60;
const FIRST_HOUR = 8 * 60; // the hours always shown: 08:00 to 18:00
const LAST_HOUR = 18 * 60;

// The same colour for a type in every week: a number from its id.
export function colourOf(typeId: string): number {
  return [...typeId].reduce((sum, c) => sum + c.charCodeAt(0), 0) % COLOURS;
}

type Interval = { start: string; end: string };
// An interval on the clock of its day: minutes from the day's midnight.
type Span = { from: number; to: number };

// The minutes on the day's clock at an instant: 0 before the day, 24 hours after it (a window
// may end at 24:00).
function minuteOf(instant: string, date: string, zone: string): number {
  const local = localDateOf(instant, zone);
  if (local < date) return 0;
  if (local > date) return DAY_MINUTES;
  const time = localTimeOf(instant, zone);
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

// Where the clock puts an interval. One that crosses the repeated hour can end, on the clock, no
// later than it starts (02:00 +02:00 to 02:00 +01:00): it then gets its real length.
function spanOf(interval: Interval, date: string, zone: string): Span {
  const from = minuteOf(interval.start, date, zone);
  const to = minuteOf(interval.end, date, zone);
  if (to > from) return { from, to };
  const real = (Date.parse(interval.end) - Date.parse(interval.start)) / 60_000;
  return { from, to: Math.min(from + real, DAY_MINUTES) };
}

// The lane of each interval among those of its kind in one day: two that share a place on the
// clock without sharing a moment go side by side, the earlier on the left.
function lanesOf(intervals: readonly Interval[], spans: readonly Span[]): Pick<Placed, 'lane' | 'lanes'>[] {
  const lanes = intervals.map((): Pick<Placed, 'lane' | 'lanes'> => ({ lane: 0, lanes: 1 }));
  intervals.forEach((a, i) => {
    intervals.forEach((b, j) => {
      const sameMoment = a.start < b.end && b.start < a.end;
      const samePlace = spans[i]!.from < spans[j]!.to && spans[j]!.from < spans[i]!.to;
      if (i === j || sameMoment || !samePlace) return;
      lanes[i] = { lane: a.start < b.start ? 0 : 1, lanes: 2 };
    });
  });
  return lanes;
}

export function weekModel(view: CalendarView, role: Role): WeekModel {
  const zone = view.timeZone;
  const today = localDateOf(view.generatedAt, zone);
  const days = view.days.map((day) => ({ ...day, appointments: view.appointments.filter((a) => a.date === day.date) }));

  // The hours shown, widened to whole hours to hold everything in the week.
  const spans = days.flatMap((day) =>
    [...day.windows, ...day.slots, ...day.busy, ...day.appointments].map((interval) => spanOf(interval, day.date, zone)),
  );
  const first = Math.floor(Math.min(FIRST_HOUR, ...spans.map((span) => span.from)) / 60) * 60;
  const last = Math.ceil(Math.max(LAST_HOUR, ...spans.map((span) => span.to)) / 60) * 60;

  // The names of the types met in the week; a slot carries its type's id only.
  const typeNames = new Map<string, string>();
  for (const day of days) for (const w of day.windows) typeNames.set(w.typeId, w.typeName);
  for (const a of view.appointments) typeNames.set(a.typeId, a.typeName);

  return {
    timeZone: zone,
    hours: Array.from({ length: (last - first) / 60 }, (_, i) => `${String(first / 60 + i).padStart(2, '0')}:00`),
    legend: [...typeNames]
      .map(([typeId, name]) => ({ name, colour: colourOf(typeId) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en')),
    days: days.map((day) => {
      // A day in which the zone's offset changes: every time shown in it carries its offset.
      const offsetChanges = offsetChangesOn(day.date, zone);
      // The day's windows with those that touch and share a type made one
      // (docs/SHARED_CALENDAR_SPEC.md section 6.6): a slot lies inside one of them.
      const merged = effectiveWindows(day.windows);
      // The blocks of one kind, each placed among the others of that kind.
      const placed = <T extends Interval>(intervals: readonly T[]): (T & Placed)[] => {
        const daySpans = intervals.map((interval) => spanOf(interval, day.date, zone));
        const lanes = lanesOf(intervals, daySpans);
        return intervals.map((interval, i) => ({
          ...interval,
          top: `${((daySpans[i]!.from - first) / (last - first)) * 100}%`,
          height: `${((daySpans[i]!.to - daySpans[i]!.from) / (last - first)) * 100}%`,
          time: rangeText(interval.start, interval.end, zone, offsetChanges),
          ...lanes[i]!,
        }));
      };
      const place = ({ top, height, time, lane, lanes }: Placed): Placed => ({ top, height, time, lane, lanes });
      return {
        date: day.date,
        label: dateText(day.date),
        today: day.date === today,
        windows: placed(day.windows).map((w) => ({ ...place(w), typeName: w.typeName, colour: colourOf(w.typeId) })),
        slots: placed(day.slots).map((s) => {
          const holder = merged.find((w) => w.start <= s.start && s.end <= w.end) ?? s;
          return {
            ...place(s),
            colour: colourOf(s.typeId),
            start: s.start,
            end: s.end,
            day: dateText(day.date),
            typeName: typeNames.get(s.typeId) ?? '',
            window: { start: holder.start, end: holder.end },
          };
        }),
        busy: placed(day.busy).map(place),
        // The Administrator's view holds everyone's appointments, a User's only the User's own
        // (docs/SHARED_CALENDAR_SPEC.md section 11.6): nothing is added to what the server sent.
        appointments: placed(day.appointments).map((a) => ({
          ...place(a),
          appointmentId: a.appointmentId,
          who: role === 'admin' ? a.username : 'You',
          typeName: a.typeName,
          note: a.note ?? '',
          colour: colourOf(a.typeId),
        })),
      };
    }),
  };
}
