import type { ApiErrorBody, ApiErrorCode, AppointmentConflict } from '@shared-calendar/shared';
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

// Error body shape of docs/ARCHITECTURE.md section 4: { error, message }. Never pass AWS error
// details here. The codes are the contract's (ApiErrorCode); a new one starts in
// @shared-calendar/shared. `conflicts` only with availability_conflict
// (docs/SHARED_CALENDAR_SPEC.md section 11.3); it goes to the body, never to a log line.
export function error(status: number, code: ApiErrorCode, message: string, conflicts?: AppointmentConflict[]): HttpResponse {
  return ok(status, (conflicts ? { error: code, message, conflicts } : { error: code, message }) satisfies ApiErrorBody);
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

// The query string as the object a `.strict()` query schema checks (docs/SHARED_CALENDAR_SPEC.md
// section 11.2): one string per parameter. A request without a query string gives `{}`, so the
// schema answers 400 for the missing fields. API Gateway (payload format 2.0) joins a repeated
// parameter with commas (`a,b`), so it arrives as one value and fails the schema's format. Nothing
// here can fail; the schema decides.
export function parseQuery(event: Pick<APIGatewayProxyEventV2, 'queryStringParameters'>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(event.queryStringParameters ?? {})) {
    if (value !== undefined) params[key] = value;
  }
  return params;
}
