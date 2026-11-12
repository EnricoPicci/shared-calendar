import { resolveRole, type CalendarSettings } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims } from '../lib/auth';
import { calendarConfig, getSettings } from '../lib/calendarDb';
import { error, ok, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';

// GET /calendar/settings (docs/SHARED_CALENDAR_SPEC.md 11.1, route 1): the Administrator and Users.
// The settings, or the defaults until the first save (R-SET-01). One log line per request (14.5).
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

  if (!caller.role) return done('forbidden', error(403, 'forbidden', 'Not allowed for this account'), caller);

  let settings: CalendarSettings;
  try {
    settings = await getSettings();
  } catch (err) {
    return done('error', error(500, 'internal_error', 'Could not read the settings'), { ...caller, reason: err });
  }
  return done('ok', ok(200, settings), caller);
};
