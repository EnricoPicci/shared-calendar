import { AppointmentsQuery, resolveRole, type ListAppointmentsResponse } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims } from '../lib/auth';
import { calendarConfig, listAppointments, type AppointmentFilter, type AppointmentSelection } from '../lib/calendarDb';
import { cancellableUntilFor, toResponse } from '../lib/calendarRules';
import { error, ok, parseQuery, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { validate } from '../lib/validation';

// GET /calendar/appointments (docs/SHARED_CALENDAR_SPEC.md section 11.1, route 16, and section
// 8.6): the Administrator and Users. Exactly one selection, `from` and `to` (at most 92 days, by
// the local date of the start) or `upcoming=true` (`end > now`), then `status` (default `booked`)
// filters it. A User gets their own appointments only, by the `sub` of their token; a `username`
// other than their own is 403, their own changes nothing. The Administrator's `username` filters on
// the stored name, earlier deleted accounts with it included, with no Cognito call. A read: no
// lock, no write. One log line with the selection, the status, the Administrator's filter and the
// count; never an appointment, a note or a `sub` (docs/SHARED_CALENDAR_SPEC.md section 14.5).
export const handler = async (event: APIGatewayProxyEventV2): Promise<HttpResponse> => {
  const started = Date.now();
  // "Now" is read once per request (docs/SHARED_CALENDAR_SPEC.md R-TIME-04): what `upcoming`
  // compares with.
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

  const query = validate(AppointmentsQuery, parseQuery(event));
  if (!query.ok) return done('invalid_request', query.response, caller);
  const { from, to, upcoming, username, status } = query.value;
  const selection: AppointmentSelection = upcoming ? { upcoming: true } : { from: from!, to: to! };
  const fields = { ...caller, ...selection, listStatus: status };

  if (role === 'user' && username !== undefined && username !== claims.value.username) {
    return done('forbidden', error(403, 'forbidden', 'A User can list only their own appointments'), fields);
  }
  const filter: AppointmentFilter = {
    owner: role === 'user' ? { userId: claims.value.sub } : username !== undefined ? { username } : null,
    status,
  };
  const target = role === 'admin' && username !== undefined ? { target: username } : {};

  let body: ListAppointmentsResponse;
  try {
    const { appointments, settings } = await listAppointments(selection, filter, now);
    body = { appointments: appointments.map((a) => toResponse(a.appointment, cancellableUntilFor(a.appointment, role, settings))) };
  } catch (err) {
    return done('error', error(500, 'internal_error', 'Could not list the appointments'), { ...fields, ...target, reason: err });
  }
  return done('ok', ok(200, body), { ...fields, ...target, count: body.appointments.length });
};
