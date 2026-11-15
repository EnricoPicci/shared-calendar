import { AppointmentIdParam, NoteBody, resolveRole, type Role } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ulid } from 'ulid';
import { getClaims } from '../lib/auth';
import { calendarConfig, ConcurrentUpdateError, updateAppointmentNote } from '../lib/calendarDb';
import { cancellableUntilFor, checkNote, toResponse } from '../lib/calendarRules';
import { error, ok, parseJsonBody, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { validate } from '../lib/validation';

// The status of each refusal (docs/SHARED_CALENDAR_SPEC.md section 11.3); the message is the
// check's.
const STATUS = { appointment_not_found: 404, appointment_not_active: 409 } as const;

// PATCH /calendar/appointments/{appointmentId} (docs/SHARED_CALENDAR_SPEC.md section 11.1, route
// 18): the Administrator and the appointment's User. The checks run in the order of
// docs/SHARED_CALENDAR_SPEC.md section 8.5, after the claims, configuration and role, and the first
// failure decides:
//   1. claims, the calendar's configuration (500), the role (403);
//   2. the path id, a ULID (400);
//   3. the body: JSON, then NoteBody with the note of docs/SHARED_CALENDAR_SPEC.md R-BOOK-11
//      (trimmed, empty → null) (400);
//   4. under the lock, on the appointment read inside the attempt (checkNote):
//      docs/SHARED_CALENDAR_SPEC.md R-PERM-01 (404, also for someone else's), active and not ended
//      (409). No notice applies.
// A note equal to the stored one writes nothing and no event (outcome `unchanged`). One log line
// with the appointmentId, the outcome and the lock attempts; never the note, the body or a `sub`
// (docs/SHARED_CALENDAR_SPEC.md R-NOTE-02 and section 14.5).
export const handler = async (event: APIGatewayProxyEventV2): Promise<HttpResponse> => {
  const started = Date.now();
  // "Now" is read once per request (docs/SHARED_CALENDAR_SPEC.md R-TIME-04): "not ended" compares
  // with it.
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
  try {
    calendarConfig();
  } catch (err) {
    return done('error', error(500, 'internal_error', 'The calendar is not configured'), { ...caller, reason: err });
  }

  if (!role) return done('forbidden', error(403, 'forbidden', 'Not allowed for this account'), caller);

  const param = validate(AppointmentIdParam, { appointmentId: event.pathParameters?.appointmentId });
  if (!param.ok) return done('invalid_request', param.response, caller);
  const { appointmentId } = param.value;

  const json = parseJsonBody(event);
  if (!json.ok) return done('invalid_request', json.response, { ...caller, appointmentId });
  const body = validate(NoteBody, json.value);
  if (!body.ok) return done('invalid_request', body.response, { ...caller, appointmentId });
  const { note } = body.value;
  const who = { role: role as Role, sub: claims.value.sub };

  try {
    // The event id is made once, outside the lock loop: a retry writes the same one.
    const change = { appointmentId, eventId: ulid(), note, by: { username: caller.username, role: role as Role } };
    const { result, attempts } = await updateAppointmentNote(change, now, (appointment) => checkNote(appointment, note, who, now));
    const fields = { ...caller, appointmentId, lockAttempts: attempts };
    if (!result.ok) {
      const status = STATUS[result.error];
      return done(status === 404 ? 'not_found' : 'conflict', error(status, result.error, result.message!), fields);
    }
    const { appointment, settings, unchanged } = result.value;
    return done(unchanged ? 'unchanged' : 'updated', ok(200, toResponse(appointment, cancellableUntilFor(appointment, role, settings))), fields);
  } catch (err) {
    if (err instanceof ConcurrentUpdateError) {
      return done('conflict', error(409, 'concurrent_update', 'The calendar is busy; try again'), { ...caller, appointmentId, lockAttempts: err.attempts });
    }
    return done('error', error(500, 'internal_error', 'Could not update the note'), { ...caller, appointmentId, reason: err });
  }
};
