import { resolveRole, Ulid } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { confirmProposal } from '../assistant/confirm';
import { REFUSALS } from '../assistant/conversation';
import { getClaims } from '../lib/auth';
import { error, ok, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { validate } from '../lib/validation';
import { z } from 'zod';

const ProposalIdParam = z.object({ proposalId: Ulid }).strict();

// POST /assistant/proposals/{proposalId}/confirm (docs/ARCHITECTURE.md section 4): the
// Administrator and the Users. The person pressed the button to confirm the proposal the
// assistant showed: its changes are run, each by the handler of its calendar route with the
// identity of this request, their outcomes are saved, and Claude is asked for the closing words.
// It takes no body and whatever is sent is not read. This is the only function of the assistant
// that can change the calendar (docs/CONVERSATIONAL_ARCHITECTURE.md section 5.5, rule 1). One log
// line per request with the conversation, the proposal's id, the tool, the route's status and the
// duration of each change, the token counts and the durations: never what a change was sent, a
// note, the wording of the proposal or any other text
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 10.1).
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

  const param = validate(ProposalIdParam, { proposalId: event.pathParameters?.proposalId });
  if (!param.ok) return done('invalid_request', param.response, caller);

  try {
    const identity = { sub: claims.value.sub, username: claims.value.username, role };
    // How long the function may still run: with too little left, the closing words are left to
    // POST /assistant/continue.
    const remainingMs = context ? () => context.getRemainingTimeInMillis() : null;
    const result = await confirmProposal(identity, param.value.proposalId, now, { requestId, remainingMs });
    if (result.ok) return done(result.log.outcome, ok(200, result.reply), { ...caller, ...result.log });
    const { status, message } = REFUSALS[result.refusal];
    return done(result.log.outcome, error(status, result.refusal, message), { ...caller, ...result.log });
  } catch (err) {
    return done('error', error(500, 'internal_error', 'The assistant could not confirm'), { ...caller, reason: err });
  }
};
