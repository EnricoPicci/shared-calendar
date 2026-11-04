import type { ApiErrorBody, ApiErrorCode } from '@shared-calendar/shared';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

export type HttpResponse = APIGatewayProxyStructuredResultV2;

// What the helpers that can fail return: the value, or the error response to send back as is.
export type Outcome<T> = { ok: true; value: T } | { ok: false; response: HttpResponse };

const JSON_HEADERS = { 'content-type': 'application/json' };

export function ok(status: number, body: unknown): HttpResponse {
  return { statusCode: status, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

export function noContent(): HttpResponse {
  return { statusCode: 204 };
}

// Error body shape of architecture section 4: { error, message }. Never pass AWS error details here.
// The codes are the contract's (ApiErrorCode); a new one starts in @shared-calendar/shared.
export function error(status: number, code: ApiErrorCode, message: string): HttpResponse {
  return ok(status, { error: code, message } satisfies ApiErrorBody);
}

export function parseJsonBody(event: Pick<APIGatewayProxyEventV2, 'body' | 'isBase64Encoded'>): Outcome<unknown> {
  const raw = event.isBase64Encoded && event.body ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  if (!raw) {
    return { ok: false, response: error(400, 'invalid_json', 'Request body must be a JSON document') };
  }
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, response: error(400, 'invalid_json', 'Request body must be a JSON document') };
  }
}
