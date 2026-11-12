import { resolveRole, type ListPatternsResponse } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims, requireGroup } from '../lib/auth';
import { calendarConfig, listPatterns } from '../lib/calendarDb';
import { error, ok, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';

// GET /calendar/patterns (docs/SHARED_CALENDAR_SPEC.md 11.1, route 7): the Administrator only.
// Every weekly pattern, by weekday, then start. One log line (14.5).
export const handler = async (event: APIGatewayProxyEventV2): Promise<HttpResponse> => {
  const started = Date.now();
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

  let patterns: ListPatternsResponse['patterns'];
  try {
    patterns = await listPatterns();
  } catch (err) {
    return done('error', error(500, 'internal_error', 'Could not read the patterns'), { ...caller, reason: err });
  }
  return done('ok', ok(200, { patterns } satisfies ListPatternsResponse), caller);
};
