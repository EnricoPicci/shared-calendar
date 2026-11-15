import { localDateOf, PatternBody, resolveRole } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ulid } from 'ulid';
import { getClaims, requireGroup } from '../lib/auth';
import { calendarConfig, ConcurrentUpdateError, createPattern, type CalendarConfig } from '../lib/calendarDb';
import { checkAvailabilityWrite } from '../lib/calendarRules';
import { error, ok, parseJsonBody, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { validate } from '../lib/validation';

// The default text of each refusal (docs/SHARED_CALENDAR_SPEC.md section 11.3); a refusal's own
// message (an overlap names the date and both windows, a conflict counts the appointments)
// replaces it.
const REFUSALS = {
  type_not_found: 'No availability type with this id',
  limit_reached: 'The calendar already has the maximum number of weekly patterns',
  availability_overlap: 'The pattern would overlap other availability',
  availability_conflict: 'Appointments would fall outside the availability',
} as const;

// POST /calendar/patterns (docs/SHARED_CALENDAR_SPEC.md section 11.1, route 8): the Administrator
// only. Creates a weekly pattern under the calendar lock, at most 50 patterns, checked against the
// rest of the calendar (docs/SHARED_CALENDAR_SPEC.md R-PAT-04, R-AV-01..05). One log line with the
// new patternId and the lock attempts, never the body or the conflicts
// (docs/SHARED_CALENDAR_SPEC.md section 14.5).
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
  const body = validate(PatternBody, json.value);
  if (!body.ok) return done('invalid_request', body.response, caller);

  // Generated once, outside the lock loop: a retry writes the same id.
  const patternId = ulid();
  const pattern = { patternId, ...body.value };
  try {
    const { result, attempts } = await createPattern(pattern, today, now, (state) =>
      checkAvailabilityWrite({ kind: 'pattern', patternId, pattern }, state, today, now, timeZone),
    );
    const fields = { ...caller, patternId, lockAttempts: attempts };
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
        patternId,
        lockAttempts: err.attempts,
      });
    }
    return done('error', error(500, 'internal_error', 'Could not create the pattern'), { ...caller, patternId, reason: err });
  }
};
