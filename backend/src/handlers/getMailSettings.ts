import { resolveRole, type MailSettings } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getClaims, requireGroup } from '../lib/auth';
import { error, ok, type HttpResponse } from '../lib/http';
import { log } from '../lib/logger';
import { getMailSettings, mailConfig } from '../lib/mailDb';

// GET /mail/settings (docs/EMAIL_ARCHITECTURE.md section 9.1): the Administrator only. The daily
// mail's settings, whether it is sent and at which hour, or the defaults (switched on, 07:00) until
// the first save. The checks run in this order, the first failure deciding: the identity and its
// role; the stage, `503 mail_unavailable` unless MAIL_STAGE is `on`, before anything is read; the
// table's configuration. One log line per request (docs/ARCHITECTURE.md section 11).
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

  let settings: MailSettings;
  try {
    mailConfig();
    settings = await getMailSettings();
  } catch (err) {
    return done('error', error(500, 'internal_error', 'Could not read the mail settings'), { ...caller, reason: err });
  }
  return done('ok', ok(200, settings), caller);
};
