import { resolveRole, type MeResponse } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims } from '../lib/auth';
import { asMe, getProfile, UserNotFoundError } from '../lib/cognito';
import { error, ok, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';

// GET /me (docs/EMAIL_ARCHITECTURE.md sections 4.2 and 9.1): the caller's own four facts, for the
// Administrator and Users alike; the role is the token's (docs/ARCHITECTURE.md section 3). A fact
// the account does not hold yet is null (docs/EMAIL_ARCHITECTURE.md section 4.3). An account
// deleted while its token still lives is 404 user_not_found. One log line
// (docs/ARCHITECTURE.md section 11) with the caller's username, never a fact.
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
  const role = caller.role;
  if (!role) return done('forbidden', error(403, 'forbidden', 'Not allowed for this account'), caller);

  let me: MeResponse;
  try {
    me = asMe(await getProfile(caller.username), role);
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      return done('not_found', error(404, 'user_not_found', 'No user with this username'), caller);
    }
    return done('error', error(500, 'internal_error', 'Could not read the details'), { ...caller, reason: err });
  }
  return done('ok', ok(200, me), caller);
};
