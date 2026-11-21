import { resolveRole } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { REFUSALS } from '../assistant/conversation';
import { continueExchange } from '../assistant/exchange';
import { getClaims } from '../lib/auth';
import { error, ok, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';

// POST /assistant/continue (docs/ARCHITECTURE.md section 4): the Administrator and the Users. The
// next step of the person's conversation when one is waiting: after a read, and after a step that
// Claude could not be asked for. It takes no body and whatever is sent is not read. One log line
// per request with the conversation, the outcome of the step, the tools it ran, the token counts
// and the durations, never a text (docs/CONVERSATIONAL_ARCHITECTURE.md section 10.1).
export const handler = async (event: APIGatewayProxyEventV2): Promise<HttpResponse> => {
  const started = Date.now();
  // "Now" is read once per request.
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
    const result = await continueExchange({ sub: claims.value.sub, username: claims.value.username, role }, now, { requestId, remainingMs: null });
    if (result.ok) return done(result.log.outcome, ok(200, result.reply), { ...caller, ...result.log });
    const { status, message } = REFUSALS[result.refusal];
    return done(result.log.outcome, error(status, result.refusal, message), { ...caller, ...result.log });
  } catch (err) {
    return done('error', error(500, 'internal_error', 'The assistant could not go on'), { ...caller, reason: err });
  }
};
