import { resolveRole, UsernameParam } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ulid } from 'ulid';
import { getClaims, requireGroup } from '../lib/auth';
import { calendarConfig, ConcurrentUpdateError, markUserDeleted } from '../lib/calendarDb';
import { deleteUser, getUserSub, globalSignOut, listGroups, UserNotFoundError } from '../lib/cognito';
import { error, noContent, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { validate } from '../lib/validation';

// DELETE /users/{username} (docs/ARCHITECTURE.md section 6.4; docs/SHARED_CALENDAR_SPEC.md section
// 10.2). In this order, the first failure decides:
//   1. claims, the admin role (403), the path (400);
//   2. AdminListGroupsForUser: unknown (404 user_not_found), in group admin (403 cannot_delete_admin);
//      a target in no group is deletable. No calendar write ever happens for an administrator;
//   3. the calendar's configuration (500): a broken CalendarTimeZone stops user deletion too;
//   4. AdminGetUser: the target's `sub`;
//   5. under the lock, the deleted-user marker and the cancellation of every active appointment not
//      yet ended (calendarDb.markUserDeleted, chunks of 40). A failure answers before any Cognito
//      change (docs/SHARED_CALENDAR_SPEC.md R-DEL-01): three lost locks 409 concurrent_update,
//      anything else 500. Repeating the delete is safe: the marker is written again, cancelled
//      appointments are skipped;
//   6. the global sign-out (skipped locally, SKIP_GLOBAL_SIGN_OUT) and AdminDeleteUser; 204.
// One log line (docs/ARCHITECTURE.md section 11): "username" is the caller, "target" the account
// being deleted (logged once the path is valid), cancelledCount and lockAttempts on success; never
// the target's `sub`.
export const handler = async (event: APIGatewayProxyEventV2): Promise<HttpResponse> => {
  const started = Date.now();
  // "Now" is read once per request: the marker's deletedAt and every cancellation compare with it.
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

  const forbidden = requireGroup(claims.value, 'admin');
  if (forbidden) return done('forbidden', forbidden, caller);

  const param = validate(UsernameParam, { username: event.pathParameters?.username });
  if (!param.ok) return done('invalid_request', param.response, caller);
  const target = param.value.username;
  const fields = { ...caller, target };

  let deletion: { cancelledCount: number; attempts: number };
  try {
    // Admin membership wins, also for a target in both groups. A target in no group is deletable.
    const groups = await listGroups(target);
    if (groups.includes('admin')) {
      return done('forbidden', error(403, 'cannot_delete_admin', 'Administrators cannot be deleted through the API'), fields);
    }
    calendarConfig();
    const userId = await getUserSub(target);
    // Event ids are made here, one per cancelled appointment on first sight: a retry reuses them.
    deletion = await markUserDeleted({ userId, username: target }, { username: caller.username, role: 'admin' }, now, ulid);
    await globalSignOut(target);
    await deleteUser(target);
  } catch (err) {
    // UserNotFoundError can also come from AdminGetUser, the sign-out or the delete, if the
    // account disappears between the calls; the answer is the same.
    if (err instanceof UserNotFoundError) {
      return done('not_found', error(404, 'user_not_found', 'No user with this username'), fields);
    }
    if (err instanceof ConcurrentUpdateError) {
      return done('conflict', error(409, 'concurrent_update', 'The calendar is busy; try again'), { ...fields, lockAttempts: err.attempts });
    }
    return done('error', error(500, 'internal_error', 'Could not delete the user'), { ...fields, reason: err });
  }

  return done('deleted', noContent(), { ...fields, cancelledCount: deletion.cancelledCount, lockAttempts: deletion.attempts });
};
