import { localDateOf, resolveRole, TypeIdParam } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims, requireGroup } from '../lib/auth';
import { calendarConfig, ConcurrentUpdateError, deleteType, type CalendarConfig } from '../lib/calendarDb';
import { checkTypeDelete } from '../lib/calendarRules';
import { error, noContent, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { validate } from '../lib/validation';

// The status of each refusal (docs/SHARED_CALENDAR_SPEC.md section 11.3): the type in the path is
// a 404.
const REFUSALS = {
  type_not_found: [404, 'No availability type with this id'],
  type_in_use: [409, 'The type is still used by availability or by appointments that have not ended'],
} as const;

// DELETE /calendar/types/{typeId} (docs/SHARED_CALENDAR_SPEC.md section 11.1, route 6): the
// Administrator only. Deletes a type under the calendar lock unless something current refers to it
// (docs/SHARED_CALENDAR_SPEC.md R-TYPE-03). One log line with the typeId and the lock attempts
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
  const today = localDateOf(now, config.timeZone);

  const forbidden = requireGroup(claims.value, 'admin');
  if (forbidden) return done('forbidden', forbidden, caller);

  const param = validate(TypeIdParam, { typeId: event.pathParameters?.typeId });
  if (!param.ok) return done('invalid_request', param.response, caller);
  const { typeId } = param.value;

  try {
    const { result, attempts } = await deleteType(typeId, today, now, (refs) => checkTypeDelete(typeId, refs, today, now));
    const fields = { ...caller, typeId, lockAttempts: attempts };
    if (!result.ok) {
      const [status, message] = REFUSALS[result.error];
      return done(status === 404 ? 'not_found' : 'conflict', error(status, result.error, message), fields);
    }
    return done('deleted', noContent(), fields);
  } catch (err) {
    if (err instanceof ConcurrentUpdateError) {
      return done('conflict', error(409, 'concurrent_update', 'The calendar is busy; try again'), {
        ...caller,
        typeId,
        lockAttempts: err.attempts,
      });
    }
    return done('error', error(500, 'internal_error', 'Could not delete the type'), { ...caller, typeId, reason: err });
  }
};
