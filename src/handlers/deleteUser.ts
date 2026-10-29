import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims, requireGroup, resolveRole } from '../lib/auth';
import { deleteUser, globalSignOut, listGroups, UserNotFoundError } from '../lib/cognito';
import { error, noContent, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { UsernameParam, validate } from '../lib/validation';

// Architecture section 6.4. One log line per request (section 11): "username" is the caller,
// "target" the account being deleted, logged only once the path parameter is valid.
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

  const param = validate(UsernameParam, { username: event.pathParameters?.username });
  if (!param.ok) return done('invalid_request', param.response, caller);
  const target = param.value.username;

  try {
    // Admin membership wins, also for a target in both groups. A target in no group is deletable.
    const groups = await listGroups(target);
    if (groups.includes('admin')) {
      return done(
        'forbidden',
        error(403, 'cannot_delete_admin', 'Administrators cannot be deleted through the API'),
        { ...caller, target },
      );
    }
    await globalSignOut(target);
    await deleteUser(target);
  } catch (err) {
    // UserNotFoundError can also come from the sign-out or the delete, if the account
    // disappears between the calls; the answer is the same.
    if (err instanceof UserNotFoundError) {
      return done('not_found', error(404, 'user_not_found', 'No user with this username'), { ...caller, target });
    }
    return done('error', error(500, 'internal_error', 'Could not delete the user'), { ...caller, target, reason: err });
  }

  return done('deleted', noContent(), { ...caller, target });
};
