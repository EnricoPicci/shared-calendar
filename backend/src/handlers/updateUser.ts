import { resolveRole, UpdateUserBody, UsernameParam, type UserProfile, type UserSummary } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims, requireGroup } from '../lib/auth';
import { asUserSummary, getProfile, listGroups, updateProfile, UserNotFoundError } from '../lib/cognito';
import { error, ok, parseJsonBody, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { validate } from '../lib/validation';

const FACTS = ['givenName', 'familyName', 'email', 'address'] as const satisfies readonly (keyof UserProfile)[];

// PUT /users/{username} (docs/EMAIL_ARCHITECTURE.md sections 4.2 and 9.1): the Administrator
// replaces the four facts of a User, or their own (docs/EMAIL_ARCHITECTURE.md decision M12). In
// this order, the first failure decides:
//   1. claims, the admin role (403), the path (400), the body (400);
//   2. AdminListGroupsForUser: unknown (404 user_not_found); in group admin and not the caller
//      (403 cannot_edit_admin): another administrator's facts are their own;
//   3. AdminGetUser: the facts held before, to name the ones that change, and the state;
//   4. AdminUpdateUserAttributes; 200 with the account as GET /users shows a User.
// One log line (docs/ARCHITECTURE.md section 11): "username" is the caller, "target" the account,
// `changed` the names of the facts that change; never a value (docs/EMAIL_ARCHITECTURE.md
// section 12.4).
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
  const fields = { ...caller, target };

  const json = parseJsonBody(event);
  if (!json.ok) return done('invalid_request', json.response, fields);
  const body = validate(UpdateUserBody, json.value);
  if (!body.ok) return done('invalid_request', body.response, fields);
  const profile = body.value;

  let answer: UserSummary;
  let changed: string[];
  try {
    const groups = await listGroups(target);
    if (groups.includes('admin') && target !== caller.username) {
      return done('forbidden', error(403, 'cannot_edit_admin', "Another administrator's details cannot be changed"), fields);
    }
    const before = await getProfile(target);
    changed = FACTS.filter((fact) => before[fact] !== profile[fact]);
    await updateProfile(target, profile);
    answer = asUserSummary({ ...before, ...profile });
  } catch (err) {
    // UserNotFoundError can also come from AdminGetUser or the update, if the account disappears
    // between the calls; the answer is the same.
    if (err instanceof UserNotFoundError) {
      return done('not_found', error(404, 'user_not_found', 'No user with this username'), fields);
    }
    return done('error', error(500, 'internal_error', 'Could not change the user'), { ...fields, reason: err });
  }

  return done('updated', ok(200, answer), { ...fields, changed });
};
