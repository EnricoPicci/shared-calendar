import { DateParam, localDateOf, OverrideBody, resolveRole } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims, requireGroup } from '../lib/auth';
import { calendarConfig, ConcurrentUpdateError, setOverride, type CalendarConfig } from '../lib/calendarDb';
import { checkAvailabilityWrite } from '../lib/calendarRules';
import { error, ok, parseJsonBody, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { validate } from '../lib/validation';

// The default text of each refusal (docs/SHARED_CALENDAR_SPEC.md section 11.3); a refusal's own
// message (an overlap names the date and both windows, a conflict counts the appointments)
// replaces it. An override is not counted against a limit (at most 10 windows is the body's 400);
// the code is listed because the shared check's type names it.
const REFUSALS = {
  type_not_found: 'No availability type with this id',
  limit_reached: 'A count limit was reached',
  availability_overlap: 'The override would overlap other availability',
  availability_conflict: 'Appointments would fall outside the availability',
} as const;

// PUT /calendar/overrides/{date} (docs/SHARED_CALENDAR_SPEC.md section 11.1, route 11): the
// Administrator only. Sets or replaces the override of a date under the calendar lock
// (docs/SHARED_CALENDAR_SPEC.md R-OVR-01, R-OVR-02), checked against the rest of the calendar
// (docs/SHARED_CALENDAR_SPEC.md R-AV-01..05). One log line with the date and the lock attempts,
// never the windows or the conflicts (docs/SHARED_CALENDAR_SPEC.md section 14.5).
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
  const caller = { username: claims.value.username, role: resolveRole(claims.value.groups) };

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

  const forbidden = requireGroup(claims.value, 'admin');
  if (forbidden) return done('forbidden', forbidden, caller);

  const param = validate(DateParam, { date: event.pathParameters?.date });
  if (!param.ok) return done('invalid_request', param.response, caller);
  const { date } = param.value;

  const json = parseJsonBody(event);
  if (!json.ok) return done('invalid_request', json.response, { ...caller, date });
  const body = validate(OverrideBody, json.value);
  if (!body.ok) return done('invalid_request', body.response, { ...caller, date });

  // Needs only the path and the clock, so it is answered before the lock: an override cannot be
  // set on a date before today, and today is accepted (docs/SHARED_CALENDAR_SPEC.md R-AV-02).
  if (date < today) {
    return done('conflict', error(409, 'date_in_past', 'The date is in the past'), { ...caller, date });
  }

  const { windows } = body.value;
  const by = { username: caller.username, role: 'admin' as const };
  try {
    const { result, attempts } = await setOverride(date, windows, by, today, now, (state) =>
      checkAvailabilityWrite({ kind: 'override', date, windows }, state, today, now, timeZone),
    );
    const fields = { ...caller, date, lockAttempts: attempts };
    if (!result.ok) {
      return done('conflict', error(409, result.error, result.message ?? REFUSALS[result.error], result.conflicts), {
        ...fields,
        ...(result.conflicts && { conflictCount: result.conflicts.length }),
      });
    }
    return done('updated', ok(200, result.value), fields);
  } catch (err) {
    if (err instanceof ConcurrentUpdateError) {
      return done('conflict', error(409, 'concurrent_update', 'The calendar is busy; try again'), {
        ...caller,
        date,
        lockAttempts: err.attempts,
      });
    }
    return done('error', error(500, 'internal_error', 'Could not set the override'), { ...caller, date, reason: err });
  }
};
