import { resolveRole, TypeBody, TypeIdParam } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims, requireGroup } from '../lib/auth';
import { calendarConfig, ConcurrentUpdateError, renameType } from '../lib/calendarDb';
import { checkTypeName, typeNameKey } from '../lib/calendarRules';
import { error, ok, parseJsonBody, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { validate } from '../lib/validation';

// The status of each refusal (spec 11.3): the type in the path is a 404.
const REFUSALS = {
  type_not_found: [404, 'No availability type with this id'],
  type_name_exists: [409, 'A type with this name already exists'],
} as const;

// PUT /calendar/types/{typeId} (docs/SHARED_CALENDAR_SPEC.md 11.1, route 5): the Administrator
// only. Renames a type under the calendar lock (R-TYPE-02). One log line with the typeId and the
// lock attempts, never the body or the name (14.5).
export const handler = async (event: APIGatewayProxyEventV2): Promise<HttpResponse> => {
  const started = Date.now();
  // "Now" is read once per request (R-TIME-04).
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
  try {
    calendarConfig();
  } catch (err) {
    return done('error', error(500, 'internal_error', 'The calendar is not configured'), { ...caller, reason: err });
  }

  const forbidden = requireGroup(claims.value, 'admin');
  if (forbidden) return done('forbidden', forbidden, caller);

  const param = validate(TypeIdParam, { typeId: event.pathParameters?.typeId });
  if (!param.ok) return done('invalid_request', param.response, caller);
  const { typeId } = param.value;

  const json = parseJsonBody(event);
  if (!json.ok) return done('invalid_request', json.response, { ...caller, typeId });
  const body = validate(TypeBody, json.value);
  if (!body.ok) return done('invalid_request', body.response, { ...caller, typeId });
  const { name } = body.value;

  try {
    const { result, attempts } = await renameType(typeId, { name, nameKey: typeNameKey(name) }, now, (types) =>
      checkTypeName(name, types, typeId),
    );
    const fields = { ...caller, typeId, lockAttempts: attempts };
    if (!result.ok) {
      const [status, message] = REFUSALS[result.error];
      return done(status === 404 ? 'not_found' : 'conflict', error(status, result.error, message), fields);
    }
    return done('updated', ok(200, result.value), fields);
  } catch (err) {
    if (err instanceof ConcurrentUpdateError) {
      return done('conflict', error(409, 'concurrent_update', 'The calendar is busy; try again'), {
        ...caller,
        typeId,
        lockAttempts: err.attempts,
      });
    }
    return done('error', error(500, 'internal_error', 'Could not rename the type'), { ...caller, typeId, reason: err });
  }
};
