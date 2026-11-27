import { AssistantMessageBody, resolveRole } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { REFUSALS } from '../assistant/conversation';
import { sendMessage } from '../assistant/exchange';
import { getClaims } from '../lib/auth';
import { error, ok, parseJsonBody, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { validate } from '../lib/validation';

// POST /assistant/messages (docs/ARCHITECTURE.md section 4): the Administrator and the Users. A
// message of the person to the assistant: it is checked, added to the person's conversation, and
// Claude is asked once. One log line per request with the conversation, the outcome of the step,
// the tools it ran, the token counts and the durations, never a text
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 10.1). The core is told how long the function may
// still run, as Lambda's context says it.
export const handler = async (event: APIGatewayProxyEventV2, context?: Context): Promise<HttpResponse> => {
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

  const json = parseJsonBody(event);
  if (!json.ok) return done('invalid_request', json.response, caller);
  const body = validate(AssistantMessageBody, json.value);
  if (!body.ok) return done('invalid_request', body.response, caller);

  try {
    const request = { requestId, remainingMs: context ? () => context.getRemainingTimeInMillis() : null };
    const result = await sendMessage({ sub: claims.value.sub, username: claims.value.username, role }, body.value, now, request);
    if (result.ok) return done(result.log.outcome, ok(200, result.reply), { ...caller, ...result.log });
    const { status, message } = REFUSALS[result.refusal];
    return done(result.log.outcome, error(status, result.refusal, message), { ...caller, ...result.log });
  } catch (err) {
    return done('error', error(500, 'internal_error', 'The assistant could not handle the message'), { ...caller, reason: err });
  }
};
