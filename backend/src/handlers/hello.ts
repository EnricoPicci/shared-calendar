import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ulid } from 'ulid';
import { getClaims, resolveRole, type Role } from '../lib/auth';
import { putMessage } from '../lib/db';
import { error, ok, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';

const MESSAGES: Record<Role, (username: string) => string> = {
  admin: () => 'Hello World, the Administrator is speaking',
  user: (username) => `Hello World, I am ${username}`,
};

// Architecture section 6.5. The authorizer logs nothing when it allows a request, so this
// handler writes the one log line per request (architecture section 11).
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
  const { sub, username, groups } = claims.value;

  const role = resolveRole(groups);
  if (!role) return done('forbidden', error(403, 'forbidden', 'Not allowed for this account'), { username, role });

  const message = MESSAGES[role](username);
  const messageId = ulid();
  const createdAt = new Date().toISOString();
  try {
    await putMessage({ messageId, userId: sub, userName: username, role, message, createdAt });
  } catch (err) {
    return done('error', error(500, 'internal_error', 'Could not store the message'), { username, role, reason: err });
  }

  return done('created', ok(201, { messageId, role, message, createdAt }), { username, role });
};
