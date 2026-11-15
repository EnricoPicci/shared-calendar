import { resolveRole, type ListUsersResponse } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims, requireGroup } from '../lib/auth';
import { listPlainUsers } from '../lib/cognito';
import { error, ok, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';

// GET /users (docs/SHARED_CALENDAR_SPEC.md section 10.1; docs/SHARED_CALENDAR_SPEC.md section 11.1,
// route 21): the Administrator only. The plain Users (in group user, not in admin), sorted by
// username, for the "book for a User" choice. It reads Cognito only: no calendar data, so no
// calendar configuration check. No query parameter and no paging of the answer (≤ 10 users,
// docs/ARCHITECTURE.md N6). One log line with the number of users, never their names.
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

  const forbidden = requireGroup(claims.value, 'admin');
  if (forbidden) return done('forbidden', forbidden, caller);

  try {
    const users = await listPlainUsers();
    const body: ListUsersResponse = { users };
    return done('listed', ok(200, body), { ...caller, userCount: users.length });
  } catch (err) {
    return done('error', error(500, 'internal_error', 'Could not list the users'), { ...caller, reason: err });
  }
};
