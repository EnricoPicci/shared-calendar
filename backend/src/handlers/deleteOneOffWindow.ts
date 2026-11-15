import { localDateOf, resolveRole, WindowIdParam } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims, requireGroup } from '../lib/auth';
import { calendarConfig, ConcurrentUpdateError, deleteOneOffWindow, type CalendarConfig } from '../lib/calendarDb';
import { checkAvailabilityWrite } from '../lib/calendarRules';
import { error, noContent, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { validate } from '../lib/validation';

// The status and default text of each refusal (docs/SHARED_CALENDAR_SPEC.md section 11.3). A
// delete brings in no type, adds no window and cannot create an overlap: only window_not_found,
// date_in_past and availability_conflict happen here; the others are listed because the shared
// check's type names them.
const REFUSALS = {
  window_not_found: [404, 'No one-off window with this id'],
  date_in_past: [409, 'The window is dated in the past'],
  type_not_found: [409, 'No availability type with this id'],
  limit_reached: [409, 'A count limit was reached'],
  availability_overlap: [409, 'The change would overlap other availability'],
  availability_conflict: [409, 'Appointments would fall outside the availability'],
} as const;

// DELETE /calendar/windows/{windowId} (docs/SHARED_CALENDAR_SPEC.md section 11.1, route 14): the
// Administrator only. Removes a one-off window under the calendar lock unless an appointment that
// has not ended would fall outside the availability (docs/SHARED_CALENDAR_SPEC.md R-AV-03). The path
// names only the id, so date_in_past (a window dated before today) is known only once the window is
// found, inside the locked attempt. One log line with the windowId and the lock attempts, never the
// conflicts (docs/SHARED_CALENDAR_SPEC.md section 14.5).
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

  const param = validate(WindowIdParam, { windowId: event.pathParameters?.windowId });
  if (!param.ok) return done('invalid_request', param.response, caller);
  const { windowId } = param.value;

  try {
    const { result, attempts } = await deleteOneOffWindow(windowId, today, now, (state) =>
      checkAvailabilityWrite({ kind: 'one_off', windowId, window: null }, state, today, now, timeZone),
    );
    const fields = { ...caller, windowId, lockAttempts: attempts };
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
        windowId,
        lockAttempts: err.attempts,
      });
    }
    return done('error', error(500, 'internal_error', 'Could not delete the window'), { ...caller, windowId, reason: err });
  }
};
