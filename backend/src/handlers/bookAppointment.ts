import { BookBody, localDateOf, resolveRole, type Role } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ulid } from 'ulid';
import { getClaims } from '../lib/auth';
import { bookAppointment, calendarConfig, ConcurrentUpdateError, type CalendarConfig } from '../lib/calendarDb';
import { cancellableUntilFor, checkBooking, checkBookingTimes, toResponse } from '../lib/calendarRules';
import { getUserSub, isPlainUser, UserNotFoundError } from '../lib/cognito';
import { error, ok, parseJsonBody, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { validate } from '../lib/validation';

// POST /calendar/appointments (docs/SHARED_CALENDAR_SPEC.md section 11.1, route 17): the
// Administrator and Users. The checks run in the order of docs/SHARED_CALENDAR_SPEC.md section 8.2,
// after the claims, configuration and role, and the first failure decides:
//   1. claims, the calendar's configuration (500), the role (403);
//   2. the body: JSON, BookBody with the note (docs/SHARED_CALENDAR_SPEC.md R-BOOK-11) and the
//      exact instant form (400);
//   3. docs/SHARED_CALENDAR_SPEC.md R-BOOK-01 from the body: a User naming someone else (403), the
//      Administrator without a `username` (400); then docs/SHARED_CALENDAR_SPEC.md R-BOOK-13, a User
//      sending `overbook: true` (403);
//   4. docs/SHARED_CALENDAR_SPEC.md R-BOOK-02, the times for the role (400);
//   5. the Administrator's target through Cognito, before the lock: unknown (404), not a plain User
//      (409 target_not_user). A User books for themself, on the `sub` of their token;
//   6. under the lock, on the data read inside the attempt: docs/SHARED_CALENDAR_SPEC.md
//      R-BOOK-03 to R-BOOK-06, R-BOOK-12, R-BOOK-07 (which the Administrator's `overbook` lifts)
//      and R-BOOK-09 (409);
//   7. docs/SHARED_CALENDAR_SPEC.md R-BOOK-10 in the transaction: a deleted-user marker for the
//      `sub` (404).
// One log line with the appointmentId on success and the lock attempts. Never the note, the body,
// or the target's `sub` (docs/SHARED_CALENDAR_SPEC.md section 14.5 and AC-36).
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

  const json = parseJsonBody(event);
  if (!json.ok) return done('invalid_request', json.response, caller);
  const body = validate(BookBody, json.value);
  if (!body.ok) return done('invalid_request', body.response, caller);

  // The part of docs/SHARED_CALENDAR_SPEC.md R-BOOK-01 that the body and the caller decide: a User
  // books for themself only, and the Administrator names the User.
  const named = body.value.username;
  if (role === 'user' && named !== undefined && named !== claims.value.username) {
    return done('forbidden', error(403, 'forbidden', 'A User can book only for themself'), caller);
  }
  if (role === 'admin' && named === undefined) {
    return done('invalid_request', error(400, 'invalid_request', 'Invalid input: username'), caller);
  }
  // Only the Administrator may go over a type's capacity (docs/SHARED_CALENDAR_SPEC.md R-BOOK-13);
  // `overbook: false` from a User is the same as leaving it out.
  const overbook = body.value.overbook === true;
  if (role === 'user' && overbook) {
    return done('forbidden', error(403, 'forbidden', 'Only the Administrator can book over the capacity'), caller);
  }

  // The times for the role (docs/SHARED_CALENDAR_SPEC.md R-BOOK-02): needs only the body and
  // the zone.
  const times = checkBookingTimes(body.value.start, body.value.end, role, timeZone);
  if ('error' in times) return done('invalid_request', error(400, times.error, times.message!), caller);

  // The User the appointment is for. The Administrator's target is read from Cognito before the
  // lock: it does not depend on the calendar, so a lock retry need not repeat it.
  let target: { username: string; sub: string };
  const targetField = role === 'admin' ? { target: named } : {};
  if (role === 'admin') {
    const username = named!;
    try {
      const sub = await getUserSub(username);
      if (!(await isPlainUser(username))) {
        return done('conflict', error(409, 'target_not_user', 'The account is not a User'), { ...caller, ...targetField });
      }
      target = { username, sub };
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        return done('not_found', error(404, 'user_not_found', 'No user with this username'), { ...caller, ...targetField });
      }
      return done('error', error(500, 'internal_error', 'Could not book the appointment'), { ...caller, ...targetField, reason: err });
    }
  } else {
    target = { username: claims.value.username, sub: claims.value.sub };
  }

  // Generated once, outside the lock loop: a retry writes the same ids.
  const booking = {
    appointmentId: ulid(),
    eventId: ulid(),
    userId: target.sub,
    username: target.username,
    start: times.start,
    end: times.end,
    note: body.value.note ?? null,
    by: { username: caller.username, role: role as Role },
  };
  try {
    const { result, attempts } = await bookAppointment(booking, today, now, (state, settings) =>
      checkBooking({ start: times.start, end: times.end, role, userId: target.sub, overbook, settings, state, now, today, zone: timeZone }),
    );
    const fields = { ...caller, ...targetField, lockAttempts: attempts };
    if (!result.ok) {
      if (result.error === 'user_not_found') {
        return done('not_found', error(404, 'user_not_found', 'The user has been deleted'), fields);
      }
      return done('conflict', error(409, result.error, result.message!), fields);
    }
    const { appointment, settings } = result.value;
    return done('created', ok(201, toResponse(appointment, cancellableUntilFor(appointment, role, settings))), { ...fields, appointmentId: appointment.appointmentId });
  } catch (err) {
    if (err instanceof ConcurrentUpdateError) {
      return done('conflict', error(409, 'concurrent_update', 'The calendar is busy; try again'), {
        ...caller,
        ...targetField,
        lockAttempts: err.attempts,
      });
    }
    return done('error', error(500, 'internal_error', 'Could not book the appointment'), { ...caller, ...targetField, reason: err });
  }
};
