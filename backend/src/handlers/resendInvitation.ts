import { resolveRole, UsernameParam, type CreateUserResponse } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims, requireGroup } from '../lib/auth';
import { getProfile, listGroups, NotInvitedError, resendInvitation, UserNotFoundError } from '../lib/cognito';
import { error, ok, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { validate } from '../lib/validation';

// POST /users/{username}/invitation (docs/EMAIL_ARCHITECTURE.md sections 5.3 and 9.1): the
// Administrator sends a User's invitation again, with a new temporary password that Cognito makes
// and e-mails to the address on file. In this order, the first failure decides:
//   1. claims, the admin role (403); the stage: unless MAIL_STAGE is `on`, 503 mail_unavailable
//      before anything is read or sent (docs/EMAIL_ARCHITECTURE.md section 13.2); the path (400);
//   2. AdminListGroupsForUser: unknown (404 user_not_found); in group admin (403
//      cannot_edit_admin): an administrator is never invited, its password is set by the bootstrap;
//   3. AdminGetUser: an account that has already chosen its password (409 not_invited);
//   4. AdminCreateUser with RESEND; 202 with the username and the state `invited`. Should the
//      account become active between 3 and 4, Cognito refuses the resend: 409 too.
// cognito-local does not support the resend (docs/EMAIL_ARCHITECTURE.md section 14.1): locally the
// refusals above answer as in the cloud, and step 4 ends in a 500.
// One log line (docs/ARCHITECTURE.md section 11): "username" is the caller, "target" the account;
// never a fact or an address (docs/EMAIL_ARCHITECTURE.md section 12.4).
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

  const param = validate(UsernameParam, { username: event.pathParameters?.username });
  if (!param.ok) return done('invalid_request', param.response, caller);
  const target = param.value.username;
  const fields = { ...caller, target };

  try {
    const groups = await listGroups(target);
    if (groups.includes('admin')) {
      return done('forbidden', error(403, 'cannot_edit_admin', 'An administrator is never sent an invitation'), fields);
    }
    const account = await getProfile(target);
    if (account.status !== 'invited') throw new NotInvitedError(target);
    await resendInvitation(target);
  } catch (err) {
    // UserNotFoundError can also come from AdminGetUser or the resend, if the account disappears
    // between the calls; the answer is the same.
    if (err instanceof UserNotFoundError) {
      return done('not_found', error(404, 'user_not_found', 'No user with this username'), fields);
    }
    if (err instanceof NotInvitedError) {
      return done('not_invited', error(409, 'not_invited', 'This user has already chosen a password'), fields);
    }
    return done('error', error(500, 'internal_error', 'Could not send the invitation'), { ...fields, reason: err });
  }

  return done('resent', ok(202, { username: target, status: 'invited' } satisfies CreateUserResponse), fields);
};
