import { AppointmentIdParam, ChangeBody, localDateOf, resolveRole, type Role } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ulid } from 'ulid';
import { getClaims } from '../lib/auth';
import { calendarConfig, changeAppointment, ConcurrentUpdateError, type CalendarConfig } from '../lib/calendarDb';
import { cancellableUntilFor, checkBookingTimes, checkChange, toResponse } from '../lib/calendarRules';
import { error, ok, parseJsonBody, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { validate } from '../lib/validation';

// The status of each refusal (docs/SHARED_CALENDAR_SPEC.md section 11.3); the message is the
// check's.
const STATUS = {
  appointment_not_found: 404,
  user_not_found: 404,
  appointment_not_active: 409,
  cancellation_notice_too_short: 403,
  booking_in_past: 409,
  booking_notice_too_short: 409,
  booking_beyond_horizon: 409,
  outside_availability: 409,
  slot_taken: 409,
  appointment_limit_reached: 409,
} as const;
const OUTCOME = { 404: 'not_found', 409: 'conflict', 403: 'too_late' } as const;

// POST /calendar/appointments/{appointmentId}/change (docs/SHARED_CALENDAR_SPEC.md section 11.1,
// route 20): the Administrator and the appointment's User. The checks run in the order of
// docs/SHARED_CALENDAR_SPEC.md section 8.4, after the claims, configuration and role, and the first
// failure decides:
//   1. claims, the calendar's configuration (500), the role (403);
//   2. the path id, a ULID (400);
//   3. the body: JSON, ChangeBody with the note (docs/SHARED_CALENDAR_SPEC.md R-BOOK-11) and the
//      exact instant form (400);
//   4. docs/SHARED_CALENDAR_SPEC.md R-BOOK-02, the new times for the role (400), before the lock;
//   5. under the lock, on the data read inside the attempt (checkChange): the old appointment as a
//      cancel (404, 409, 403 for a User), then the new one as a booking for the old one's User
//      (409), the old appointment left out of the overlap and the limit
//      (docs/SHARED_CALENDAR_SPEC.md R-CHG-01);
//   6. docs/SHARED_CALENDAR_SPEC.md R-BOOK-10 in the transaction: a deleted-user marker for the old
//      appointment's `sub` (404).
// No Cognito call: the User is the old appointment's (docs/SHARED_CALENDAR_SPEC.md section 8.4).
// The note: absent keeps the old one, null clears it (docs/SHARED_CALENDAR_SPEC.md R-CHG-03). One
// log line with `appointmentId` (the old one, from the path), `newAppointmentId` on success, the
// outcome and the lock attempts. Never the note, the body or a `sub` (docs/SHARED_CALENDAR_SPEC.md
// section 14.5 and AC-36).
export const handler = async (event: APIGatewayProxyEventV2): Promise<HttpResponse> => {
  const started = Date.now();
  // "Now" is read once per request; "today" is its local date in the calendar's zone
  // (docs/SHARED_CALENDAR_SPEC.md R-TIME-04).
  const now = new Date(started).toISOString();
  const requestId = event.requestContext?.requestId ?? 'unknown';
  const route = event.routeKey;
  const done = (outcome: string, response: HttpResponse, fields: Record<string, unknown> = {}): HttpResponse => {
    const level = (response.statusCode ?? 500) >= 500 ? 'error' : 'info';
    log(level, { requestId, route, ...fields, outcome, status: response.statusCode, durationMs: Date.now() - started });
    return response;
  };

  const claims = getClaims(event);
  if (!claims.ok) return done('unauthorized', claims.response);
  const role = resolveRole(claims.value.groups);
  const caller = { username: claims.value.username, role };

  // A broken CalendarTimeZone answers 500 to every request, whatever the role
  // (docs/SHARED_CALENDAR_SPEC.md R-TIME-01).
  let config: CalendarConfig;
  try {
    config = calendarConfig();
  } catch (err) {
    return done('error', error(500, 'internal_error', 'The calendar is not configured'), { ...caller, reason: err });
  }
  const { timeZone } = config;
  const today = localDateOf(now, timeZone);

  if (!role) return done('forbidden', error(403, 'forbidden', 'Not allowed for this account'), caller);

  const param = validate(AppointmentIdParam, { appointmentId: event.pathParameters?.appointmentId });
  if (!param.ok) return done('invalid_request', param.response, caller);
  const { appointmentId } = param.value;
  const fields = { ...caller, appointmentId };

  const json = parseJsonBody(event);
  if (!json.ok) return done('invalid_request', json.response, fields);
  const body = validate(ChangeBody, json.value);
  if (!body.ok) return done('invalid_request', body.response, fields);

  // The times for the role (docs/SHARED_CALENDAR_SPEC.md R-BOOK-02): needs only the body and
  // the zone.
  const times = checkBookingTimes(body.value.start, body.value.end, role, timeZone);
  if ('error' in times) return done('invalid_request', error(400, times.error, times.message!), fields);

  const who = { role: role as Role, sub: claims.value.sub };
  // Generated once, outside the lock loop: a retry writes the same ids.
  const change = {
    appointmentId,
    newAppointmentId: ulid(),
    eventId: ulid(),
    start: times.start,
    end: times.end,
    note: body.value.note,
    by: { username: caller.username, role: role as Role },
  };
  try {
    const { result, attempts } = await changeAppointment(change, today, now, (appointment, state, settings) =>
      checkChange({ appointment, caller: who, start: times.start, end: times.end, settings, state, now, today, zone: timeZone }),
    );
    const logged = { ...fields, lockAttempts: attempts };
    if (!result.ok) {
      const status = STATUS[result.error];
      const message = result.error === 'user_not_found' ? 'The user has been deleted' : result.message!;
      return done(OUTCOME[status], error(status, result.error, message), logged);
    }
    const { cancelled, booked, settings } = result.value;
    const answer = {
      cancelled: toResponse(cancelled, cancellableUntilFor(cancelled, role, settings)),
      booked: toResponse(booked, cancellableUntilFor(booked, role, settings)),
    };
    return done('changed', ok(201, answer), { ...logged, newAppointmentId: booked.appointmentId });
  } catch (err) {
    if (err instanceof ConcurrentUpdateError) {
      return done('conflict', error(409, 'concurrent_update', 'The calendar is busy; try again'), { ...fields, lockAttempts: err.attempts });
    }
    return done('error', error(500, 'internal_error', 'Could not change the appointment'), { ...fields, reason: err });
  }
};
