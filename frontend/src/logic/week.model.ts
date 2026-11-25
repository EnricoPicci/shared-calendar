import { effectiveWindows, localDateOf, localTimeOf, type CalendarView, type Role } from '@shared-calendar/shared';
import { dateText, offsetChangesOn, rangeText } from './texts';

// The week ready to draw (docs/FRONTEND_ARCHITECTURE.md section 5): what GET /calendar answers
// (docs/SHARED_CALENDAR_SPEC.md section 11.6) turned into days of blocks, each with its place in
// the day and its time as text, so that the view does no arithmetic. Pure: everything comes from
// the view received, its `generatedAt` and its time zone included.

// A block's place in its day column, as CSS percentages of the hours shown, and its times as
// text. Blocks that the clock puts in the same place stand side by side, in `lanes` columns of
// equal width, this one in column `lane` (0 is the leftmost): the Administrator's appointments
// that overlap, up to three (docs/SHARED_CALENDAR_SPEC.md section 16.8), and two blocks of the
// hour repeated on the night the clocks go back. A block alone in its place is `lane` 0 of 1.
export type Placed = { top: string; height: string; time: string; lane: number; lanes: number };
// `colour` is one of the type colours the style sheet defines: the class `type-<colour>`.
export type WindowBlock = Placed & { typeName: string; colour: number };
// A slot also carries what the book dialog needs: its own instants, its day in words, its type's
// name, and the instants of the window that holds it, between which the Administrator may choose
// other times (docs/SHARED_CALENDAR_SPEC.md R-BOOK-08). `places` is what it says beside its time
// and `full` whether it has no place left, which only the Administrator is shown
// (docs/SHARED_CALENDAR_SPEC.md R-SLOT-04). `tab` is null for a slot drawn whole; for a slot
// that appointments overlap, which only the Administrator sees, it is the short text of a narrow
// tab drawn beside them, so that the slot can still be pressed: "Full" or "2 left".
export type SlotBlock = Placed & {
  colour: number;
  start: string;
  end: string;
  day: string; // "Mon 16 Nov"
  typeName: string;
  window: { start: string; end: string };
  places: string; // "free", "2 of 3 places left" or "Full"
  full: boolean;
  tab: string | null;
};
export type BusyBlock = Placed;
export type AppointmentBlock = Placed & {
  appointmentId: string; // what the detail dialog is opened with
  who: string; // the User's name for the Administrator, "You" for a User
  typeName: string;
  note: string; // '' when there is none
  colour: number;
  beside: boolean; // a slot's tab stands beside it, and it leaves the tab room
  short: boolean; // drawn at the least height, SHORTEST_DRAWN: room for one tight line of text
};
// Four or more of the Administrator's appointments that overlap, drawn as one block over their
// whole span that opens the list of them (docs/SHARED_CALENDAR_SPEC.md section 16.8). `what`
// counts them with the type of their window, which is one: windows of one date never overlap
// (docs/SHARED_CALENDAR_SPEC.md R-AV-01). Each row opens its appointment's detail.
export type GroupBlock = Placed & {
  what: string; // "4 people · Swimming Pool"
  when: string; // "Mon 16 Nov, 10:00–11:15", the list's heading
  colour: number;
  rows: { appointmentId: string; time: string; who: string }[];
  beside: boolean;
};
export type DayModel = {
  date: string;
  label: string; // "Mon 16 Nov"
  today: boolean;
  windows: WindowBlock[];
  slots: SlotBlock[];
  busy: BusyBlock[];
  appointments: AppointmentBlock[];
  groups: GroupBlock[]; // the Administrator's only; a User's own appointments never overlap
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
// The most of the Administrator's appointments drawn side by side; more become one block.
const SIDE_BY_SIDE = 3;
// The least an appointment is drawn tall, in minutes of the clock: 15 minutes are about 13
// pixels, one line of its text and something to press; 5 minutes, the shortest appointment
// (docs/SHARED_CALENDAR_SPEC.md decision D32), would be about 4. Its text keeps its true times
// (docs/FRONTEND_ARCHITECTURE.md section 11, decision 199).
const SHORTEST_DRAWN = 15;

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

// Where an appointment is drawn: never lower than SHORTEST_DRAWN, and never past `last`, the
// end of the hours shown; one that would pass it is drawn ending there, starting earlier.
function drawnSpan(span: Span, last: number): Span {
  const to = Math.min(Math.max(span.to, span.from + SHORTEST_DRAWN), last);
  return { from: Math.min(span.from, to - SHORTEST_DRAWN), to };
}

// The places of the blocks of one kind in one day, on the spans they are drawn on. Blocks are
// chained while each starts before the chain's last end on the clock; in a chain each takes,
// the earliest first, the leftmost column free at its start, so a chain has as many columns as
// blocks at its peak. On every day but one the clock is real time and a block is drawn on its
// own times, so a chain is appointments that overlap ([start, end): two that touch are not
// chained) and its peak is the people at once (docs/SHARED_CALENDAR_SPEC.md R-SLOT-02). An
// appointment drawn taller than its time chains with one that starts inside that height, and
// the two stand side by side: the peak is then of blocks, not of people. On the night the clocks
// go back two blocks an hour apart can share a place on the clock: they are chained too, and
// stand side by side, the earlier on the left.
type Columned = Pick<Placed, 'lane' | 'lanes'> & { chain: number };
function columnsOf(intervals: readonly Interval[], spans: readonly Span[]): Columned[] {
  const order = intervals.map((_, i) => i).sort((a, b) => spans[a]!.from - spans[b]!.from || Date.parse(intervals[a]!.start) - Date.parse(intervals[b]!.start));
  const placed: Columned[] = intervals.map(() => ({ lane: 0, lanes: 1, chain: 0 }));
  let chains = 0;
  let chain: number[] = [];
  let ends: number[] = []; // the clock's minute at which each column of the chain is free again
  const close = () => {
    for (const i of chain) placed[i]!.lanes = ends.length;
  };
  for (const i of order) {
    const { from, to } = spans[i]!;
    if (chain.length > 0 && from >= Math.max(...ends)) {
      close();
      chains += 1;
      chain = [];
      ends = [];
    }
    const free = ends.findIndex((end) => end <= from);
    const lane = free === -1 ? ends.length : free;
    ends[lane] = to;
    chain.push(i);
    placed[i] = { lane, lanes: 1, chain: chains };
  }
  close();
  return placed;
}

// What a slot says beside its time (docs/SHARED_CALENDAR_SPEC.md section 16.8): "free" with
// one place, its places left when it has more ("2 of 3 places left"), and "Full" when none is
// left, which only an Administrator's slot can be (docs/SHARED_CALENDAR_SPEC.md R-SLOT-04).
export function placesOf(capacity: number, placesLeft: number): Pick<SlotBlock, 'places' | 'full'> {
  if (placesLeft <= 0) return { places: 'Full', full: true };
  return { places: capacity > 1 ? `${placesLeft} of ${capacity} places left` : 'free', full: false };
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
      // The blocks of one kind, each placed among the others of that kind. Appointments are
      // drawn at least SHORTEST_DRAWN tall; windows, slots and a User's busy times true to scale.
      const top = (span: Span) => `${((span.from - first) / (last - first)) * 100}%`;
      const height = (span: Span) => `${((span.to - span.from) / (last - first)) * 100}%`;
      const drawn = (interval: Interval) => drawnSpan(spanOf(interval, day.date, zone), last);
      const tall = (interval: Interval) => {
        const span = drawn(interval);
        return span.to - span.from;
      };
      const placed = <T extends Interval>(intervals: readonly T[], spanFor = (interval: Interval) => spanOf(interval, day.date, zone)): (T & Columned & Omit<Placed, 'lane' | 'lanes'>)[] => {
        const daySpans = intervals.map(spanFor);
        const columns = columnsOf(intervals, daySpans);
        return intervals.map((interval, i) => ({
          ...interval,
          top: top(daySpans[i]!),
          height: height(daySpans[i]!),
          time: rangeText(interval.start, interval.end, zone, offsetChanges),
          ...columns[i]!,
        }));
      };
      const place = ({ top, height, time, lane, lanes }: Placed): Placed => ({ top, height, time, lane, lanes });
      // A slot and an appointment overlap on the clock, [from, to), on their true times: a slot's
      // tab stands beside appointments that are there at the same time.
      const slotSpans = day.slots.map((s) => spanOf(s, day.date, zone));
      const appointmentSpans = day.appointments.map((a) => spanOf(a, day.date, zone));
      const overlaps = (span: Span, others: Span[]) => others.some((other) => span.from < other.to && other.from < span.to);
      // The Administrator's appointments: a chain of more than three columns, at its peak, is one
      // block, whether its appointments overlap or only their drawn heights do; a User's never
      // has more than three, since a User's own appointments never overlap.
      const appointments = placed(day.appointments, drawn);
      const grouped = (a: (typeof appointments)[number]) => role === 'admin' && a.lanes > SIDE_BY_SIDE;
      const chains = new Map<number, typeof appointments>();
      for (const a of appointments.filter(grouped)) chains.set(a.chain, [...(chains.get(a.chain) ?? []), a]);
      const groups = [...chains.values()].map((members): GroupBlock => {
        const byStart = [...members].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
        const spans = members.map(drawn);
        const span = { from: Math.min(...spans.map((s) => s.from)), to: Math.max(...spans.map((s) => s.to)) };
        const earliest = byStart[0]!;
        const end = members.map((a) => a.end).reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
        const time = rangeText(earliest.start, end, zone, offsetChanges);
        return {
          top: top(span),
          height: height(span),
          time,
          lane: 0,
          lanes: 1,
          what: `${members.length} people · ${earliest.typeName}`,
          when: `${dateText(day.date)}, ${time}`,
          colour: colourOf(earliest.typeId),
          rows: byStart.map((a) => ({ appointmentId: a.appointmentId, time: a.time, who: a.username })),
          beside: overlaps(span, slotSpans),
        };
      });
      return {
        date: day.date,
        label: dateText(day.date),
        today: day.date === today,
        windows: placed(day.windows).map((w) => ({ ...place(w), typeName: w.typeName, colour: colourOf(w.typeId) })),
        slots: placed(day.slots).map((s, i) => {
          const holder = merged.find((w) => w.start <= s.start && s.end <= w.end) ?? s;
          const shown = placesOf(s.capacity, s.placesLeft);
          return {
            ...place(s),
            colour: colourOf(s.typeId),
            start: s.start,
            end: s.end,
            day: dateText(day.date),
            typeName: typeNames.get(s.typeId) ?? '',
            window: { start: holder.start, end: holder.end },
            ...shown,
            tab: overlaps(slotSpans[i]!, appointmentSpans) ? (shown.full ? 'Full' : `${s.placesLeft} left`) : null,
          };
        }),
        busy: placed(day.busy).map(place),
        // The Administrator's view holds everyone's appointments, a User's only the User's own
        // (docs/SHARED_CALENDAR_SPEC.md section 11.6): nothing is added to what the server sent.
        appointments: appointments
          .filter((a) => !grouped(a))
          .map((a) => ({
            ...place(a),
            appointmentId: a.appointmentId,
            who: role === 'admin' ? a.username : 'You',
            typeName: a.typeName,
            note: a.note ?? '',
            colour: colourOf(a.typeId),
            beside: overlaps(spanOf(a, day.date, zone), slotSpans),
            short: tall(a) <= SHORTEST_DRAWN,
          })),
        groups,
      };
    }),
  };
}
