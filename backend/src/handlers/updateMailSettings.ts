import { MailSettingsBody, resolveRole } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims, requireGroup } from '../lib/auth';
import { error, ok, parseJsonBody, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { mailConfig, putMailSettings } from '../lib/mailDb';
import { validate } from '../lib/validation';

// PUT /mail/settings (docs/EMAIL_ARCHITECTURE.md section 9.1): the Administrator only. Saves the
// daily mail's settings, both values together: whether it is sent, and the whole hour, 0 to 23, in
// the calendar's time zone. The checks run in this order, the first failure deciding: the identity
// and its role; the stage, `503 mail_unavailable` unless MAIL_STAGE is `on`, before anything is
// read or written; the table's configuration; the body. One log line per request
// (docs/ARCHITECTURE.md section 11), with the two values saved: they are no personal data.
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
  const caller = { username: claims.value.username, role: resolveRole(claims.value.groups) };
  const forbidden = requireGroup(claims.value, 'admin');
  if (forbidden) return done('forbidden', forbidden, caller);

  if (process.env.MAIL_STAGE !== 'on') return done('mail_unavailable', error(503, 'mail_unavailable', 'E-mail is not available yet'), caller);

  try {
    mailConfig();
  } catch (err) {
    return done('error', error(500, 'internal_error', 'E-mail is not configured'), { ...caller, reason: err });
  }

  const json = parseJsonBody(event);
  if (!json.ok) return done('invalid_request', json.response, caller);
  const body = validate(MailSettingsBody, json.value);
  if (!body.ok) return done('invalid_request', body.response, caller);

  try {
    const saved = await putMailSettings(body.value, caller.username, now);
    return done('updated', ok(200, saved), { ...caller, ...saved });
  } catch (err) {
    return done('error', error(500, 'internal_error', 'Could not save the mail settings'), { ...caller, reason: err });
  }
};
