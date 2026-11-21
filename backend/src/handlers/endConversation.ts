import { resolveRole } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { closeConversation } from '../assistant/conversation';
import { getClaims } from '../lib/auth';
import { error, noContent, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';

// DELETE /assistant/conversation (docs/ARCHITECTURE.md section 4): the Administrator and the
// Users. Ends the caller's own conversation with the assistant, "New conversation" on the screen;
// with none to end it answers the same 204. One log line per request.
export const handler = async (event: APIGatewayProxyEventV2): Promise<HttpResponse> => {
  const started = Date.now();
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
  const role = resolveRole(claims.value.groups);
  const caller = { username: claims.value.username, role };
  if (!role) return done('forbidden', error(403, 'forbidden', 'Not allowed for this account'), caller);

  try {
    const ended = await closeConversation({ sub: claims.value.sub, username: claims.value.username, role }, now);
    return done(ended.outcome, noContent(), { ...caller, ...ended });
  } catch (err) {
    return done('error', error(500, 'internal_error', 'Could not end the conversation'), { ...caller, reason: err });
  }
};
