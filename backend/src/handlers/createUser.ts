import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims, requireGroup, resolveRole } from '../lib/auth';
import { addToGroup, createUser, deleteUser, setPermanentPassword, UserExistsError } from '../lib/cognito';
import { error, ok, parseJsonBody, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { generatePassword } from '../lib/password';
import { CreateUserBody, validate } from '../lib/validation';

// Architecture section 6.3, including the rollback. One log line per request (section 11):
// "username" is the caller, "target" the account being created. The response body carries
// the password, so it is never passed to the logger.
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

  const json = parseJsonBody(event);
  if (!json.ok) return done('invalid_request', json.response, caller);
  const body = validate(CreateUserBody, json.value);
  if (!body.ok) return done('invalid_request', body.response, caller);
  const target = body.value.username;

  const password = generatePassword();
  try {
    await createUser(target);
  } catch (err) {
    if (err instanceof UserExistsError) {
      return done('conflict', error(409, 'user_exists', 'A user with this username already exists'), { ...caller, target });
    }
    return done('error', error(500, 'internal_error', 'Could not create the user'), { ...caller, target, reason: err });
  }

  try {
    await setPermanentPassword(target, password);
    await addToGroup(target, 'user');
  } catch (err) {
    // Remove the half-created account so that a retry does not hit 409. Best effort: if the
    // delete fails too, the log line says so and the operator removes the account by hand.
    const rollback = await deleteUser(target).then(
      () => ({ rollback: 'deleted' }),
      (rollbackErr: unknown) => ({ rollback: 'failed', rollbackReason: rollbackErr }),
    );
    return done('error', error(500, 'internal_error', 'Could not create the user'), {
      ...caller,
      target,
      reason: err,
      ...rollback,
    });
  }

  return done('created', ok(201, { username: target, password }), { ...caller, target });
};
