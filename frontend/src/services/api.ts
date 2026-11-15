import type { ApiErrorCode, AppointmentConflict } from '@shared-calendar/shared';
import { Observable, of } from 'rxjs';
import { fromFetch } from 'rxjs/fetch';
import { catchError, map, switchMap, take, tap } from 'rxjs/operators';
import { describe } from './cognito';
import type { SessionStore } from './session.store';

// One authenticated API call, shared by every API service (docs/FRONTEND_SERVICES.md section 10.2):
// it reads the token from the store, sends it as a bearer header, builds the query string, clears
// the store when the API rejects the token (docs/FRONTEND_SERVICES.md section 9.4), and turns the
// body's `error` code into the failure reason, with the `conflicts` list where the code has one.

export type ApiConfig = {
  apiUrl: string; // ApiUrl output of the back-end stack (no trailing slash), or 'http://127.0.0.1:3000'
};

// The reasons every API call can fail with, whatever the route.
export type TransportFailureReason =
  | 'not_signed_in' // the store is empty: no request is sent
  // 401, or 403 without an `error` field: the store is cleared (docs/FRONTEND_SERVICES.md section
  // 9.4).
  | 'session_rejected'
  | 'network' // fetch rejected: offline, DNS, CORS, refused
  | 'server' // 5xx or 429 without an `error` field, or a body that is not JSON
  | 'unexpected'; // any other answer outside the contract

// `C` is the set of error codes the route can answer with, taken from the shared ApiErrorCode so a
// service cannot invent one (docs/FRONTEND_SERVICES.md section 8, decision 18).
export type ApiFailure<C extends ApiErrorCode> = {
  status: 'failure';
  reason: C | TransportFailureReason;
  message: string; // the API's own text when there is one; never a token
  // Set only when the reason is `availability_conflict`: the appointments the refused write would
  // leave outside the availability, [] when the body lists none that are well formed.
  conflicts?: AppointmentConflict[];
};
// A 2xx. `body` is the parsed JSON, or undefined when the body is empty (the 204 of a delete).
export type ApiOk = { status: 'ok'; httpStatus: number; body: unknown };

// A union, so that the compiler refuses a body where fetch would (GET) or the API reads none (DELETE).
type ApiRequestBase<C extends ApiErrorCode> = {
  path: string; // '/hello', '/users', '/calendar/types/<encoded typeId>'
  // Encoded with URLSearchParams, keys in the order given; no '?' when absent or empty.
  query?: Record<string, string>;
  codes: readonly C[]; // the route's error codes, as listed in docs/ARCHITECTURE.md section 4
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

// The failure for an input that a shared schema refused, answered without sending a request
// (docs/FRONTEND_SERVICES.md section 8, decision 33). The message is the first issue with its field
// path, e.g. `end: end must be after start`, or the issue's message alone when it has no path.
export function invalidRequest(error: SchemaError): ApiFailure<'invalid_request'> {
  const [issue = { path: [], message: 'invalid input' }] = error.issues; // zod reports at least one
  const field = issue.path.map(String).join('.');
  return apiFailure('invalid_request', field === '' ? issue.message : `${field}: ${issue.message}`);
}

// Whether a parsed body is an object with a string `key` (the shape checks of the services).
export function hasString(value: unknown, key: string): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>)[key] === 'string';
}

// Never errors and completes after one value, so the services can feed their subjects from it
// with `next` only and the subjects stay alive (docs/FRONTEND_SERVICES.md section 3.2).
export function apiCall<C extends ApiErrorCode>(
  config: ApiConfig,
  store: SessionStore,
  request: ApiRequest<C>,
): Observable<ApiOk | ApiFailure<C>> {
  return store.session$.pipe(
    take(1), // the session as it is at the moment of the call, not when the service was built
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
          // Only a rejected token clears the store, and only if it still holds the session that was
          // used: a newer one stays (docs/FRONTEND_SERVICES.md section 9.4).
          if (answer.status === 'failure' && answer.reason === 'session_rejected') store.clear(session);
        }),
        catchError((err: unknown) => of(transportFailure('network', describe(err)))),
      );
    }),
  );
}

// Turns an HTTP status and body into a success or a failure reason. The checks follow the rows of
// the mapping table in docs/FRONTEND_SERVICES.md section 10.2, top to bottom: the first that
// matches decides.
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

  // Any body: the token cannot be used.
  if (status === 401) return transportFailure('session_rejected', message);
  if (!json) return transportFailure('server', `API answered ${status} without JSON`);
  if (status >= 200 && status < 300) return { status: 'ok', httpStatus: status, body: parsed };
  if (typeof body.error !== 'string') {
    // No `error` code: the answer comes from API Gateway itself, `{ "message": "…" }`, not from a
    // handler (docs/ARCHITECTURE.md section 4).
    if (status === 403) return transportFailure('session_rejected', message);
    if (status >= 500 || status === 429) return transportFailure('server', message);
    return transportFailure('unexpected', message);
  }
  const code = codes.find((c) => c === body.error);
  if (code === undefined) return transportFailure('unexpected', message);
  if (code === 'availability_conflict') return { ...apiFailure(code, message), conflicts: toConflicts(body.conflicts) };
  return apiFailure(code, message);
}

// The appointments listed in a 409 `availability_conflict` body (format in
// docs/SHARED_CALENDAR_SPEC.md section 6.7). Keeps only the entries whose four fields are strings,
// copied field by field so nothing else reaches the view; a missing or non-array list gives [], and
// the reason stays `availability_conflict` either way (docs/FRONTEND_SERVICES.md section 8, decision 30).
function toConflicts(value: unknown): AppointmentConflict[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((c) => (['appointmentId', 'username', 'start', 'end'] as const).every((key) => hasString(c, key)))
    .map((c: AppointmentConflict) => ({ appointmentId: c.appointmentId, username: c.username, start: c.start, end: c.end }));
}
