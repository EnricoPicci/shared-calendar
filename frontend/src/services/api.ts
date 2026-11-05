import type { ApiErrorCode } from '@shared-calendar/shared';
import { Observable, of } from 'rxjs';
import { fromFetch } from 'rxjs/fetch';
import { catchError, map, switchMap, take, tap } from 'rxjs/operators';
import { describe } from './cognito';
import type { SessionStore } from './session.store';

// docs/FRONTEND_SERVICES.md section 10.2. One authenticated API call, shared by HelloService and
// UsersService: the token from the store, the bearer header, the 401/403 rule of section 9.4,
// and ApiErrorBody.error → the failure reason.

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
};
// A 2xx. `body` is the parsed JSON, or undefined when the body is empty (the 204 of a delete).
export type ApiOk = { status: 'ok'; httpStatus: number; body: unknown };

export type ApiRequest<C extends ApiErrorCode> = {
  method: 'POST' | 'DELETE';
  path: string; // '/hello', '/users', '/users/<encoded username>'
  body?: unknown; // sent as JSON
  codes: readonly C[]; // the route's error codes (architecture section 4)
};

// A failure with one of the route's codes (or, from a service, a check made before any request).
export function apiFailure<C extends ApiErrorCode>(reason: C, message: string): ApiFailure<C> {
  return { status: 'failure', reason, message };
}
// A failure every route can have; assignable to any ApiFailure<C>.
export function transportFailure(reason: TransportFailureReason, message: string): ApiFailure<never> {
  return { status: 'failure', reason, message };
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
      return fromFetch(config.apiUrl + request.path, {
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
  const body = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as { error?: unknown; message?: unknown };
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
  return code === undefined ? transportFailure('unexpected', message) : apiFailure(code, message);
}
