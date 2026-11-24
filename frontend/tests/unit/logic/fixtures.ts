import type { Appointment, CalendarDay, CalendarView } from '@shared-calendar/shared';

// Calendar views for the tests of the logic layer and of the week view. Not a test file.

export const STUDIO = '01M6DMBE008N3QKX5R2D7W9VT4';
export const POOL = '01M6DMMJZ04FZ6M1H8QJ0C3BNA';

export function appointment(over: Partial<Appointment> & Pick<Appointment, 'start' | 'end' | 'date'>): Appointment {
  const actor = { username: over.username ?? 'alice', role: 'user' as const };
  return {
    appointmentId: `appt-${over.start}`,
    username: 'alice',
    typeId: STUDIO,
    typeName: 'Studio',
    note: null,
    status: 'booked',
    createdAt: '2026-11-09T17:30:00.000Z',
    createdBy: actor,
    updatedAt: '2026-11-09T17:30:00.000Z',
    updatedBy: actor,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    replaces: null,
    replacedBy: null,
    cancellableUntil: null,
    ...over,
  };
}

// Seven empty days from `monday`, each replaced by the day of `days` with the same date.
export function view(monday: string, over: Partial<CalendarView> = {}, days: Partial<CalendarDay>[] = []): CalendarView {
  const dates = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${monday}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
  return {
    timeZone: 'Europe/Rome',
    from: dates[0]!,
    to: dates[6]!,
    generatedAt: '2026-11-10T09:00:00.000Z',
    days: dates.map((date, i) => ({ date, weekday: i + 1, windows: [], slots: [], busy: [], ...days.find((d) => d.date === date) })),
    appointments: [],
    ...over,
  };
}

const z = (instant: string) => `${instant}:00.000Z`;

// The example of docs/SHARED_CALENDAR_SPEC.md section 11.6 as a whole week: Monday 2026-11-16 in
// Europe/Rome (UTC+1), a User's view. Studio 08:00–12:00 local, Swimming Pool 14:00–18:00.
export function winterWeek(): CalendarView {
  return view(
    '2026-11-16',
    {
      generatedAt: '2026-11-17T09:00:00.000Z', // Tuesday 10:00 local
      appointments: [
        appointment({ start: z('2026-11-16T10:00'), end: z('2026-11-16T11:00'), date: '2026-11-16', note: 'First lesson', cancellableUntil: z('2026-11-15T10:00') }),
      ],
    },
    [
      {
        date: '2026-11-16',
        windows: [
          { start: z('2026-11-16T07:00'), end: z('2026-11-16T11:00'), typeId: STUDIO, typeName: 'Studio' },
          { start: z('2026-11-16T13:00'), end: z('2026-11-16T17:00'), typeId: POOL, typeName: 'Swimming Pool' },
        ],
        slots: [
          { start: z('2026-11-16T07:00'), end: z('2026-11-16T08:00'), typeId: STUDIO, capacity: 1, placesLeft: 1 },
          { start: z('2026-11-16T13:00'), end: z('2026-11-16T14:00'), typeId: POOL, capacity: 1, placesLeft: 1 },
        ],
        busy: [{ start: z('2026-11-16T08:00'), end: z('2026-11-16T09:00') }],
      },
    ],
  );
}
