import { CalendarQuery, resolveRole, type CalendarView } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims } from '../lib/auth';
import { calendarConfig, readCalendarRange, type CalendarConfig } from '../lib/calendarDb';
import { calendarView } from '../lib/calendarRules';
import { error, ok, parseQuery, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { validate } from '../lib/validation';

// GET /calendar?from&to (docs/SHARED_CALENDAR_SPEC.md 11.1, route 15; 11.6): the Administrator and
// Users. The calendar view of a date range of at most 31 days, built for the caller's role. A read:
// no lock, no write. One log line with `from` and `to`, never the appointments, another User's
// username or a note (14.5, section 17).
export const handler = async (event: APIGatewayProxyEventV2): Promise<HttpResponse> => {
  const started = Date.now();
  // "Now" is read once per request (R-TIME-04): the view's generatedAt, and what its slots compare with.
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

  // A broken CalendarTimeZone answers 500 to every request, whatever the role (R-TIME-01).
  let config: CalendarConfig;
  try {
    config = calendarConfig();
  } catch (err) {
    return done('error', error(500, 'internal_error', 'The calendar is not configured'), { ...caller, reason: err });
  }

  if (!role) return done('forbidden', error(403, 'forbidden', 'Not allowed for this account'), caller);

  const query = validate(CalendarQuery, parseQuery(event));
  if (!query.ok) return done('invalid_request', query.response, caller);
  const { from, to } = query.value;

  let view: CalendarView;
  try {
    const range = await readCalendarRange(from, to);
    view = calendarView({ from, to, now, zone: config.timeZone, role, callerSub: claims.value.sub, ...range });
  } catch (err) {
    return done('error', error(500, 'internal_error', 'Could not read the calendar'), { ...caller, from, to, reason: err });
  }
  return done('ok', ok(200, view), { ...caller, from, to });
};
