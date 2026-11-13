import { DateParam, localDateOf, resolveRole } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims, requireGroup } from '../lib/auth';
import { calendarConfig, ConcurrentUpdateError, deleteOverride, type CalendarConfig } from '../lib/calendarDb';
import { checkAvailabilityWrite } from '../lib/calendarRules';
import { error, noContent, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { validate } from '../lib/validation';

// The status and default text of each refusal (spec 11.3). A delete brings in no type and adds no
// window: only override_not_found, availability_overlap (the patterns that apply again against the
// date's one-off windows, 6.5) and availability_conflict happen here; the others are listed because
// the shared check's type names them.
const REFUSALS = {
  override_not_found: [404, 'No override on this date'],
  type_not_found: [409, 'No availability type with this id'],
  limit_reached: [409, 'A count limit was reached'],
  availability_overlap: [409, 'The change would overlap other availability'],
  availability_conflict: [409, 'Appointments would fall outside the availability'],
} as const;

// DELETE /calendar/overrides/{date} (docs/SHARED_CALENDAR_SPEC.md 11.1, route 12): the
// Administrator only. Removes the override of a date under the calendar lock, so the weekly
// patterns apply again (R-OVR-02), unless they would overlap a one-off window of the date (R-AV-01)
// or an appointment that has not ended would fall outside the availability (R-AV-03). One log line
// with the date and the lock attempts, never the conflicts (14.5).
export const handler = async (event: APIGatewayProxyEventV2): Promise<HttpResponse> => {
  const started = Date.now();
  // "Now" is read once per request; "today" is its local date in the calendar's zone (R-TIME-04).
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

  // A broken CalendarTimeZone answers 500 to every request, whatever the role (R-TIME-01).
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

  // Needs only the path and the clock, so it is answered before the lock, and before looking for
  // the override: a date before today answers date_in_past whether it has one or not (R-AV-02).
  if (date < today) {
    return done('conflict', error(409, 'date_in_past', 'The date is in the past'), { ...caller, date });
  }

  try {
    const { result, attempts } = await deleteOverride(date, today, now, (state) =>
      checkAvailabilityWrite({ kind: 'override', date, windows: null }, state, today, now, timeZone),
    );
    const fields = { ...caller, date, lockAttempts: attempts };
    if (!result.ok) {
      const [status, message] = REFUSALS[result.error];
      return done(status === 404 ? 'not_found' : 'conflict', error(status, result.error, result.message ?? message, result.conflicts), {
        ...fields,
        ...(result.conflicts && { conflictCount: result.conflicts.length }),
      });
    }
    return done('deleted', noContent(), fields);
  } catch (err) {
    if (err instanceof ConcurrentUpdateError) {
      return done('conflict', error(409, 'concurrent_update', 'The calendar is busy; try again'), {
        ...caller,
        date,
        lockAttempts: err.attempts,
      });
    }
    return done('error', error(500, 'internal_error', 'Could not delete the override'), { ...caller, date, reason: err });
  }
};
