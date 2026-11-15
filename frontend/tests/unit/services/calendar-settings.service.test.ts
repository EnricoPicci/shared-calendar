import type { CalendarSettings } from '@shared-calendar/shared';
import { CalendarSettingsService } from '../../../src/services/calendar-settings.service';
import { json } from './fixtures';
import { CONFIG, describeMethod, type MethodSpec } from './suite';

// docs/FRONTEND_SERVICES.md section 15.8: the per-method suite of suite.ts for both methods.

const SETTINGS: CalendarSettings = {
  timeZone: 'Europe/Rome',
  cancellationNoticeHours: 24,
  minBookingNoticeHours: 0,
  bookingHorizonDays: 56,
  maxFutureAppointmentsPerUser: null,
  updatedAt: null,
  updatedBy: null,
};
const INPUT = { cancellationNoticeHours: 48, minBookingNoticeHours: 2, bookingHorizonDays: 30, maxFutureAppointmentsPerUser: 3 };
const SAVED: CalendarSettings = { ...SETTINGS, ...INPUT, updatedAt: '2026-11-15T09:00:00.000Z', updatedBy: { username: 'admin', role: 'admin' } };

type S = CalendarSettingsService;
const make = (store: ConstructorParameters<typeof CalendarSettingsService>[1]) => new CalendarSettingsService(CONFIG, store);

const load: MethodSpec<S> = {
  name: 'load',
  result$: (s) => s.settingsResult$,
  state$: (s) => s.settingsState$,
  call: (s) => s.load(),
  pending: { status: 'pending' },
  request: { method: 'GET', path: '/calendar/settings' },
  ok: () => json(200, SETTINGS),
  success: { status: 'success', settings: SETTINGS },
  wrong: [
    ['200 without timeZone', () => json(200, { ...SETTINGS, timeZone: undefined })],
    ['201 with the settings', () => json(201, SETTINGS)],
    ['200 empty', () => new Response(null, { status: 200 })],
  ],
  codes: ['forbidden', 'internal_error'],
  notCodes: ['concurrent_update', 'invalid_request'],
};

const update: MethodSpec<S> = {
  name: 'update',
  result$: (s) => s.updateResult$,
  state$: (s) => s.updateState$,
  call: (s) => s.update(INPUT),
  pending: { status: 'pending', settings: INPUT },
  request: { method: 'PUT', path: '/calendar/settings', body: INPUT },
  ok: () => json(200, SAVED),
  success: { status: 'success', settings: SAVED },
  wrong: [
    ['200 with timeZone a number', () => json(200, { ...SAVED, timeZone: 1 })],
    ['204', () => new Response(null, { status: 204 })],
  ],
  codes: ['forbidden', 'invalid_json', 'invalid_request', 'concurrent_update', 'internal_error'],
  notCodes: ['type_not_found'],
  invalid: [
    ['out of range', (s) => s.update({ ...INPUT, bookingHorizonDays: 366 }), 'bookingHorizonDays: Too big: expected number to be <=365'],
    ['not an integer', (s) => s.update({ ...INPUT, cancellationNoticeHours: 1.5 }), 'cancellationNoticeHours: Invalid input: expected int, received number'],
    ['a missing field', (s) => s.update({ ...INPUT, minBookingNoticeHours: undefined } as never), 'minBookingNoticeHours: Invalid input: expected number, received undefined'],
    ['an unknown field (no path)', (s) => s.update({ ...INPUT, timeZone: 'Asia/Tokyo' } as never), 'Unrecognized key: "timeZone"'],
  ],
};

describe('CalendarSettingsService', () => {
  describeMethod(make, load, update);
  describeMethod(make, update, load);
});
