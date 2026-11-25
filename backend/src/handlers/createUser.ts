import { CreateUserBody, resolveRole, type CreateUserResponse } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims, requireGroup } from '../lib/auth';
import { addToGroup, createUser, deleteUser, UserExistsError } from '../lib/cognito';
import { error, ok, parseJsonBody, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { validate } from '../lib/validation';

// The flow of docs/EMAIL_ARCHITECTURE.md section 5.1, including the rollback. The account is
// created with its four facts (docs/EMAIL_ARCHITECTURE.md section 4.1) and no password: Cognito
// makes a temporary one and e-mails it as the invitation, so the answer is the username and the
// state `invited`. Unless MAIL_STAGE is `on`, no invitation could go through our own sender, so
// the route answers 503 mail_unavailable before anything is made (docs/EMAIL_ARCHITECTURE.md
// section 13.2). One log line per request (docs/ARCHITECTURE.md section 11): "username" is the
// caller, "target" the account being created; never a fact.
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

  if (process.env.MAIL_STAGE !== 'on') return done('mail_unavailable', error(503, 'mail_unavailable', 'E-mail is not available yet'), caller);

  const json = parseJsonBody(event);
  if (!json.ok) return done('invalid_request', json.response, caller);
  const body = validate(CreateUserBody, json.value);
  if (!body.ok) return done('invalid_request', body.response, caller);
  const { username: target, ...profile } = body.value;

  try {
    await createUser(target, profile);
  } catch (err) {
    if (err instanceof UserExistsError) {
      return done('conflict', error(409, 'user_exists', 'A user with this username already exists'), { ...caller, target });
    }
    return done('error', error(500, 'internal_error', 'Could not create the user'), { ...caller, target, reason: err });
  }

  try {
    await addToGroup(target, 'user');
  } catch (err) {
    // Remove the half-created account so that a retry does not hit 409. Its invitation has gone
    // already and no longer opens anything. Best effort: if the delete fails too, the log line
    // says so and the operator removes the account by hand.
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

  return done('created', ok(201, { username: target, status: 'invited' } satisfies CreateUserResponse), { ...caller, target });
};
