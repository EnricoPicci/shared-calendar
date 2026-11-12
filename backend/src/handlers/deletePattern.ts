import { localDateOf, PatternIdParam, resolveRole } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims, requireGroup } from '../lib/auth';
import { calendarConfig, ConcurrentUpdateError, deletePattern, type CalendarConfig } from '../lib/calendarDb';
import { checkAvailabilityWrite } from '../lib/calendarRules';
import { error, noContent, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { validate } from '../lib/validation';

// The status and default text of each refusal (spec 11.3). A delete brings in no type, adds no
// pattern and cannot create an overlap (11.1, note 1): only pattern_not_found and
// availability_conflict happen here; the others are listed because the shared check's type names them.
const REFUSALS = {
  pattern_not_found: [404, 'No weekly pattern with this id'],
  type_not_found: [409, 'No availability type with this id'],
  limit_reached: [409, 'A count limit was reached'],
  availability_overlap: [409, 'The change would overlap other availability'],
  availability_conflict: [409, 'Appointments would fall outside the availability'],
} as const;

// DELETE /calendar/patterns/{patternId} (docs/SHARED_CALENDAR_SPEC.md 11.1, route 10): the
// Administrator only. Deletes a pattern under the calendar lock unless an appointment that has not
// ended would fall outside the availability (R-AV-03). One log line with the patternId and the lock
// attempts, never the conflicts (14.5).
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

  const param = validate(PatternIdParam, { patternId: event.pathParameters?.patternId });
  if (!param.ok) return done('invalid_request', param.response, caller);
  const { patternId } = param.value;

  try {
    const { result, attempts } = await deletePattern(patternId, today, now, (state) =>
      checkAvailabilityWrite({ kind: 'pattern', patternId, pattern: null }, state, today, now, timeZone),
    );
    const fields = { ...caller, patternId, lockAttempts: attempts };
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
        patternId,
        lockAttempts: err.attempts,
      });
    }
    return done('error', error(500, 'internal_error', 'Could not delete the pattern'), { ...caller, patternId, reason: err });
  }
};
