import { localDateOf, MailCalendarBody, resolveRole, type MailCalendarResponse } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims } from '../lib/auth';
import { getProfile, UserNotFoundError } from '../lib/cognito';
import { error, ok, parseJsonBody, type HttpResponse } from '../lib/http';
import { startMailer } from '../lib/lambdaInvoke';
import { log } from '../lib/logger';
import { countMailRequest, mailConfig } from '../lib/mailDb';
import { kindFor } from '../lib/mailerEvent';
import { validate } from '../lib/validation';

// POST /mail/calendar (docs/EMAIL_ARCHITECTURE.md section 9.1; the Administrator and Users): a mail
// with the appointments of two local dates, sent to the asker's own address by the mailer, started
// in the background. The role decides what is sent, never the body: the whole calendar for the
// Administrator, their own appointments for a User.
//
// The checks run in the order of docs/EMAIL_ARCHITECTURE.md sections 6.5 and 9.1, the first failure
// deciding: the identity and its role; the stage, `503 mail_unavailable` unless MAIL_STAGE is `on`,
// before anything is read or counted; the body; the address, `409 no_email_address`, before the
// mail is counted; the count of the local day under a condition, `429 mail_limit_reached` past
// 5; then the mailer's start and `202`. A mail counted whose start then fails stays counted: the
// person sees the 500 and has four more that day. One log line (docs/ARCHITECTURE.md section 11)
// with the caller, the kind and the range; never an address.
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

  if (process.env.MAIL_STAGE !== 'on') return done('mail_unavailable', error(503, 'mail_unavailable', 'E-mail is not available yet'), caller);

  let timeZone: string;
  try {
    timeZone = mailConfig().timeZone;
  } catch (err) {
    return done('error', error(500, 'internal_error', 'E-mail is not configured'), { ...caller, reason: err });
  }

  const json = parseJsonBody(event);
  if (!json.ok) return done('invalid_request', json.response, caller);
  const body = validate(MailCalendarBody, json.value);
  if (!body.ok) return done('invalid_request', body.response, caller);
  const { from, to } = body.value;
  const kind = kindFor(role);
  const fields = { ...caller, kind, from, to };

  try {
    const address = (await getProfile(caller.username)).email;
    if (address === null) return done('no_email_address', error(409, 'no_email_address', 'This account has no e-mail address'), fields);

    const today = localDateOf(now, timeZone);
    if (!(await countMailRequest(claims.value.sub, today, now))) {
      return done('limit_reached', error(429, 'mail_limit_reached', 'No more e-mails can be asked for today'), fields);
    }

    await startMailer({ kind, sub: claims.value.sub, username: caller.username, role, from, to, requestId });
  } catch (err) {
    if (err instanceof UserNotFoundError) return done('not_found', error(404, 'user_not_found', 'No user with this username'), fields);
    return done('error', error(500, 'internal_error', 'Could not ask for the e-mail'), { ...fields, reason: err });
  }
  return done('queued', ok(202, { status: 'queued' } satisfies MailCalendarResponse), fields);
};
