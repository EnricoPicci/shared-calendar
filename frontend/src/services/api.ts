import type { ApiErrorCode, AppointmentConflict } from '@shared-calendar/shared';
import { Observable, of } from 'rxjs';
import { fromFetch } from 'rxjs/fetch';
import { catchError, map, switchMap, take, tap } from 'rxjs/operators';
import { describe } from './cognito';
import type { SessionStore } from './session.store';

// docs/FRONTEND_SERVICES.md section 10.2. One authenticated API call, shared by every API
// service: the token from the store, the bearer header, the 401/403 rule of section 9.4, the
// query string, and ApiErrorBody.error → the failure reason (with `conflicts`, v6).

export type ApiConfig = {
  apiUrl: string; // ApiUrl output of the back-end stack (no trailing slash), or 'http://127.0.0.1:3000'
};

// The reasons every API call can fail with, whatever the route.
export type TransportFailureReason =
  | 'not_signed_in' // the store is empty: no request is sent
  | 'session_rejected' // 401, or 403 without an `error` field: the store is cleared (section 9.4)
  | 'network' // fetch rejected: offline, DNS, CORS, refused
  | 'server' // 5xx or 429 without an `error` field, or a body that is not JSON
  | 'unexpected'; // any other answer outside the contract

// C: the error codes the route can answer with, from the shared ApiErrorCode (decision 18).
export type ApiFailure<C extends ApiErrorCode> = {
  status: 'failure';
  reason: C | TransportFailureReason;
  message: string; // the API's own text when there is one; never a token
  // Only with `availability_conflict` (v6): the body's well-formed entries, [] when it has none.
  conflicts?: AppointmentConflict[];
};
// A 2xx. `body` is the parsed JSON, or undefined when the body is empty (the 204 of a delete).
export type ApiOk = { status: 'ok'; httpStatus: number; body: unknown };

// A union (v6): the compiler refuses a body where fetch would (GET) or the API reads none (DELETE).
type ApiRequestBase<C extends ApiErrorCode> = {
  path: string; // '/hello', '/users', '/calendar/types/<encoded typeId>'
  query?: Record<string, string>; // encoded with URLSearchParams, keys in the order given; no '?' when absent or empty
  codes: readonly C[]; // the route's error codes (architecture section 4)
};
export type ApiRequest<C extends ApiErrorCode> =
  | (ApiRequestBase<C> & { method: 'GET' | 'DELETE'; body?: never })
  | (ApiRequestBase<C> & { method: 'POST' | 'PUT' | 'PATCH'; body?: unknown }); // body sent as JSON

// A failure with one of the route's codes (or, from a service, a check made before any request).
export function apiFailure<C extends ApiErrorCode>(reason: C, message: string): ApiFailure<C> {
  return { status: 'failure', reason, message };
}
// A failure every route can have; assignable to any ApiFailure<C>.
export function transportFailure(reason: TransportFailureReason, message: string): ApiFailure<never> {
  return { status: 'failure', reason, message };
}

// A 2xx that is not the contract's (a service's shape check failed).
export function unexpectedAnswer(answer: ApiOk): ApiFailure<never> {
  return transportFailure('unexpected', `API answered ${answer.httpStatus} with an unexpected body`);
}

// The shape a zod error has (frontend/src may not import zod itself: the schemas come from shared/).
type SchemaError = { issues: readonly { path: readonly PropertyKey[]; message: string }[] };

// Section 10.2 (v6, decision 33): an input that fails a shared schema, answered before any request.
// The first issue with its field, `end: end must be after start`; without a path, the message alone.
export function invalidRequest(error: SchemaError): ApiFailure<'invalid_request'> {
  const [issue = { path: [], message: 'invalid input' }] = error.issues; // zod reports at least one
  const field = issue.path.map(String).join('.');
  return apiFailure('invalid_request', field === '' ? issue.message : `${field}: ${issue.message}`);
}

// Whether a parsed body is an object with a string `key` (the shape checks of the services).
export function hasString(value: unknown, key: string): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>)[key] === 'string';
}

// Never errors and completes after one value: the services feed their subjects from it with
// `next` only (section 3.2).
export function apiCall<C extends ApiErrorCode>(
  config: ApiConfig,
  store: SessionStore,
  request: ApiRequest<C>,
): Observable<ApiOk | ApiFailure<C>> {
  return store.session$.pipe(
    take(1), // the current session, at the moment of the call (section 9.5)
    switchMap((session): Observable<ApiOk | ApiFailure<C>> => {
      if (!session) return of(transportFailure('not_signed_in', 'Nobody is signed in'));
      const hasBody = request.body !== undefined;
      const query = new URLSearchParams(request.query).toString();
      return fromFetch(config.apiUrl + request.path + (query === '' ? '' : `?${query}`), {
        method: request.method,
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
        // Read the body inside the stream, so that unsubscribing also abandons the body read.
        selector: (response) => response.text().then((text) => ({ status: response.status, text })),
      }).pipe(
        map(({ status, text }) => toApiAnswer(status, text, request.codes)),
        tap((answer) => {
          // Section 9.4: only a rejected token clears, and only the session that was used.
          if (answer.status === 'failure' && answer.reason === 'session_rejected') store.clear(session);
        }),
        catchError((err: unknown) => of(transportFailure('network', describe(err)))),
      );
    }),
  );
}

// The mapping table of section 10.2, in its order.
function toApiAnswer<C extends ApiErrorCode>(status: number, text: string, codes: readonly C[]): ApiOk | ApiFailure<C> {
  let parsed: unknown;
  let json = true;
  try {
    parsed = text === '' ? undefined : JSON.parse(text);
  } catch {
    json = false;
  }
  // A JSON answer that is not an object (null, a number), or no body at all, is read as {}.
  const body = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as { error?: unknown; message?: unknown; conflicts?: unknown };
  const message = typeof body.message === 'string' ? body.message : `API answered ${status}`;

  if (status === 401) return transportFailure('session_rejected', message); // any body: the token cannot be used
  if (!json) return transportFailure('server', `API answered ${status} without JSON`);
  if (status >= 200 && status < 300) return { status: 'ok', httpStatus: status, body: parsed };
  if (typeof body.error !== 'string') {
    // API Gateway's own answers, { "message": "…" } (architecture section 4).
    if (status === 403) return transportFailure('session_rejected', message);
    if (status >= 500 || status === 429) return transportFailure('server', message);
    return transportFailure('unexpected', message);
  }
  const code = codes.find((c) => c === body.error);
  if (code === undefined) return transportFailure('unexpected', message);
  if (code === 'availability_conflict') return { ...apiFailure(code, message), conflicts: toConflicts(body.conflicts) };
  return apiFailure(code, message);
}

// Spec 6.7: the well-formed entries only; a missing or non-array `conflicts` gives [] (decision 30).
function toConflicts(value: unknown): AppointmentConflict[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((c) => (['appointmentId', 'username', 'start', 'end'] as const).every((key) => hasString(c, key)))
    .map((c: AppointmentConflict) => ({ appointmentId: c.appointmentId, username: c.username, start: c.start, end: c.end }));
}
