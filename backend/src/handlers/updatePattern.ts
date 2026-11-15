import { localDateOf, PatternBody, PatternIdParam, resolveRole } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims, requireGroup } from '../lib/auth';
import { calendarConfig, ConcurrentUpdateError, updatePattern, type CalendarConfig } from '../lib/calendarDb';
import { checkAvailabilityWrite } from '../lib/calendarRules';
import { error, ok, parseJsonBody, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { validate } from '../lib/validation';

// The status and default text of each refusal (docs/SHARED_CALENDAR_SPEC.md section 11.3): the
// pattern in the path is a 404, and a refusal's own message (overlap, conflict) replaces the
// default text. An update adds no pattern, so limit_reached cannot happen; it is listed because
// the shared check's type names it.
const REFUSALS = {
  pattern_not_found: [404, 'No weekly pattern with this id'],
  type_not_found: [409, 'No availability type with this id'],
  limit_reached: [409, 'The calendar already has the maximum number of weekly patterns'],
  availability_overlap: [409, 'The pattern would overlap other availability'],
  availability_conflict: [409, 'Appointments would fall outside the availability'],
} as const;

// PUT /calendar/patterns/{patternId} (docs/SHARED_CALENDAR_SPEC.md section 11.1, route 9): the
// Administrator only. Replaces every field of a pattern (docs/SHARED_CALENDAR_SPEC.md R-PAT-03)
// under the calendar lock, checked against the calendar as it would be after the write
// (docs/SHARED_CALENDAR_SPEC.md R-AV-01..05). One log line with the patternId and the lock
// attempts, never the body or the conflicts (docs/SHARED_CALENDAR_SPEC.md section 14.5).
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

  const param = validate(PatternIdParam, { patternId: event.pathParameters?.patternId });
  if (!param.ok) return done('invalid_request', param.response, caller);
  const { patternId } = param.value;

  const json = parseJsonBody(event);
  if (!json.ok) return done('invalid_request', json.response, { ...caller, patternId });
  const body = validate(PatternBody, json.value);
  if (!body.ok) return done('invalid_request', body.response, { ...caller, patternId });

  const pattern = { patternId, ...body.value };
  try {
    const { result, attempts } = await updatePattern(pattern, today, now, (state) =>
      checkAvailabilityWrite({ kind: 'pattern', patternId, pattern }, state, today, now, timeZone),
    );
    const fields = { ...caller, patternId, lockAttempts: attempts };
    if (!result.ok) {
      const [status, message] = REFUSALS[result.error];
      return done(status === 404 ? 'not_found' : 'conflict', error(status, result.error, result.message ?? message, result.conflicts), {
        ...fields,
        ...(result.conflicts && { conflictCount: result.conflicts.length }),
      });
    }
    return done('updated', ok(200, result.value), fields);
  } catch (err) {
    if (err instanceof ConcurrentUpdateError) {
      return done('conflict', error(409, 'concurrent_update', 'The calendar is busy; try again'), {
        ...caller,
        patternId,
        lockAttempts: err.attempts,
      });
    }
    return done('error', error(500, 'internal_error', 'Could not update the pattern'), { ...caller, patternId, reason: err });
  }
};
