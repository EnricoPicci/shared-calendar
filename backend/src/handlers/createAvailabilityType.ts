import { resolveRole, TypeBody } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ulid } from 'ulid';
import { getClaims, requireGroup } from '../lib/auth';
import { calendarConfig, ConcurrentUpdateError, createType } from '../lib/calendarDb';
import { checkTypeName, typeNameKey } from '../lib/calendarRules';
import { error, ok, parseJsonBody, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { validate } from '../lib/validation';

const REFUSALS = {
  type_name_exists: 'A type with this name already exists',
  limit_reached: 'The calendar already has the maximum number of types',
} as const;

// POST /calendar/types (docs/SHARED_CALENDAR_SPEC.md 11.1, route 4): the Administrator only.
// Creates a type under the calendar lock (R-TYPE-01: unique name, at most 20 types). One log line
// with the new typeId and the lock attempts, never the body or the name (14.5).
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

  const json = parseJsonBody(event);
  if (!json.ok) return done('invalid_request', json.response, caller);
  const body = validate(TypeBody, json.value);
  if (!body.ok) return done('invalid_request', body.response, caller);
  const { name } = body.value;

  // Generated once, outside the lock loop: a retry writes the same id.
  const typeId = ulid();
  try {
    const { result, attempts } = await createType({ typeId, name, nameKey: typeNameKey(name) }, now, (types) =>
      checkTypeName(name, types),
    );
    const fields = { ...caller, typeId, lockAttempts: attempts };
    if (!result.ok) return done('conflict', error(409, result.error, REFUSALS[result.error]), fields);
    return done('created', ok(201, result.value), fields);
  } catch (err) {
    if (err instanceof ConcurrentUpdateError) {
      return done('conflict', error(409, 'concurrent_update', 'The calendar is busy; try again'), {
        ...caller,
        typeId,
        lockAttempts: err.attempts,
      });
    }
    return done('error', error(500, 'internal_error', 'Could not create the type'), { ...caller, typeId, reason: err });
  }
};
