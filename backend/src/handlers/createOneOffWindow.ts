import { localDateOf, OneOffWindowBody, resolveRole } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ulid } from 'ulid';
import { getClaims, requireGroup } from '../lib/auth';
import { calendarConfig, ConcurrentUpdateError, createOneOffWindow, type CalendarConfig } from '../lib/calendarDb';
import { checkAvailabilityWrite } from '../lib/calendarRules';
import { error, ok, parseJsonBody, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { validate } from '../lib/validation';

// The default text of each refusal (docs/SHARED_CALENDAR_SPEC.md section 11.3); a refusal's own
// message (an overlap names the date and both windows) replaces it. A new window only adds
// availability, so availability_conflict cannot happen (docs/SHARED_CALENDAR_SPEC.md R-AV-04); it
// is listed because the shared check's type names it.
const REFUSALS = {
  type_not_found: 'No availability type with this id',
  limit_reached: 'The date already has the maximum number of one-off windows',
  availability_overlap: 'The window would overlap other availability',
  availability_conflict: 'Appointments would fall outside the availability',
} as const;

// POST /calendar/windows (docs/SHARED_CALENDAR_SPEC.md section 11.1, route 13): the Administrator
// only. Adds a one-off window on a date under the calendar lock, at most 10 per date
// (docs/SHARED_CALENDAR_SPEC.md R-ONE-01 and R-ONE-03), checked against the date's other windows
// (docs/SHARED_CALENDAR_SPEC.md R-AV-01). One log line with the new windowId, its date and the lock
// attempts, never the window's times or type (docs/SHARED_CALENDAR_SPEC.md section 14.5).
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

  const json = parseJsonBody(event);
  if (!json.ok) return done('invalid_request', json.response, caller);
  const body = validate(OneOffWindowBody, json.value);
  if (!body.ok) return done('invalid_request', body.response, caller);
  const { date } = body.value;

  // Needs only the body and the clock, so it is answered before the lock: a one-off window cannot
  // be dated before today, and today is accepted (docs/SHARED_CALENDAR_SPEC.md R-AV-02).
  if (date < today) {
    return done('conflict', error(409, 'date_in_past', 'The date is in the past'), { ...caller, date });
  }

  // Generated once, outside the lock loop: a retry writes the same id.
  const windowId = ulid();
  const window = { windowId, ...body.value };
  const by = { username: caller.username, role: 'admin' as const };
  try {
    const { result, attempts } = await createOneOffWindow(window, by, today, now, (state) =>
      checkAvailabilityWrite({ kind: 'one_off', windowId, window }, state, today, now, timeZone),
    );
    const fields = { ...caller, windowId, date, lockAttempts: attempts };
    if (!result.ok) {
      return done('conflict', error(409, result.error, result.message ?? REFUSALS[result.error], result.conflicts), {
        ...fields,
        ...(result.conflicts && { conflictCount: result.conflicts.length }),
      });
    }
    return done('created', ok(201, result.value), fields);
  } catch (err) {
    if (err instanceof ConcurrentUpdateError) {
      return done('conflict', error(409, 'concurrent_update', 'The calendar is busy; try again'), {
        ...caller,
        windowId,
        date,
        lockAttempts: err.attempts,
      });
    }
    return done('error', error(500, 'internal_error', 'Could not create the window'), { ...caller, windowId, date, reason: err });
  }
};
