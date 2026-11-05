import { resolveRole } from '@shared-calendar/shared';
import { BehaviorSubject, Observable, ReplaySubject, Subscription, of } from 'rxjs';
import { fromFetch } from 'rxjs/fetch';
import { catchError, map, tap } from 'rxjs/operators';
import { decodeClaims } from './jwt';
import type { LoginFailureReason, LoginResult, LoginState } from './login.types';

// docs/FRONTEND_SERVICES.md section 4. Sign-in is a direct call to Cognito's InitiateAuth with
// USER_PASSWORD_AUTH (architecture sections 3.1 and 6.2); there is no login endpoint in the API.

export type LoginConfig = {
  cognitoUrl: string; // 'https://cognito-idp.eu-north-1.amazonaws.com/' or 'http://localhost:9229/'
  clientId: string; // UserPoolClientId output of the back-end stack, or CLIENT_ID of env.local.json
};

export class LoginService {
  // Pure reactive stream: outcomes only, replayed to late subscribers.
  private readonly resultSubject = new ReplaySubject<LoginResult>(1);
  readonly loginResult$: Observable<LoginResult> = this.resultSubject.asObservable();

  // State machine: idle → pending → success | failure → pending → …
  private readonly stateSubject = new BehaviorSubject<LoginState>({ status: 'idle' });
  readonly loginState$: Observable<LoginState> = this.stateSubject.asObservable();

  // The attempt in flight, so that a new attempt can cancel it.
  private pending?: Subscription;

  constructor(private readonly config: LoginConfig) {}

  // The password lives only in this argument and in the request body: never stored, never logged.
  login(username: string, password: string): void {
    this.pending?.unsubscribe(); // aborts the previous fetch; its answer is discarded
    this.stateSubject.next({ status: 'pending', username });

    this.pending = fromFetch(this.config.cognitoUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: this.config.clientId,
        AuthParameters: { USERNAME: username, PASSWORD: password },
      }),
      // Read the body inside the stream, so that unsubscribing also abandons the body read.
      selector: (response) => response.text().then((text) => ({ status: response.status, text })),
    })
      .pipe(
        map(({ status, text }) => toLoginResult(status, text)),
        catchError((err: unknown) => of(failure('network', describe(err)))),
        tap((result) => this.stateSubject.next(result)),
      )
      // Forward `next` only, never `subscribe(this.resultSubject)`: the HTTP observable completes
      // after one value, and a completed (or errored) subject ignores every later `next`, so the
      // second login would reach no one (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.resultSubject.next(result));
  }
}

// The two bodies Cognito can answer with (docs/FRONTEND_SERVICES.md section 4.1).
type AuthenticationResult = { AccessToken?: string; IdToken?: string; RefreshToken?: string; ExpiresIn?: number };
type InitiateAuthResponse = { AuthenticationResult?: AuthenticationResult; ChallengeName?: string };
type CognitoError = { __type?: string; message?: string };

function failure(reason: LoginFailureReason, message: string): LoginResult {
  return { status: 'failure', reason, message };
}

// For the network failure: the error name and text, which never include the request body.
function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

const REASON_BY_TYPE: Record<string, LoginFailureReason> = {
  NotAuthorizedException: 'invalid_credentials',
  UserNotFoundException: 'invalid_credentials',
  // cognito-local's answer to a wrong password; real Cognito's InitiateAuth never returns it.
  InvalidPasswordException: 'invalid_credentials',
  TooManyRequestsException: 'too_many_attempts',
  LimitExceededException: 'too_many_attempts',
  PasswordResetRequiredException: 'password_reset_required',
};

function toLoginResult(status: number, text: string): LoginResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return failure('server', `Cognito answered ${status} without JSON`);
  }
  // A JSON answer that is not an object (null, a number) is read as an empty object.
  const body = typeof parsed === 'object' && parsed !== null ? parsed : {};

  if (status === 200) {
    const auth = (body as InitiateAuthResponse).AuthenticationResult;
    if (!auth?.AccessToken) return failure('challenge', 'Cognito asked for a challenge');
    return toSession(auth as AuthenticationResult & { AccessToken: string });
  }
  const error = body as CognitoError;
  // __type may carry a namespace prefix ("com.amazonaws…#NotAuthorizedException").
  const type = String(error.__type ?? '').split('#').pop() ?? '';
  const reason = REASON_BY_TYPE[type] ?? (status >= 500 ? 'server' : 'unexpected');
  return failure(reason, error.message ?? `Cognito answered ${status}`);
}

// Reads username, cognito:groups and exp from the access token. A token whose claims cannot be
// read is an `unexpected` failure (not a thrown error, which catchError would call `network`).
function toSession(auth: AuthenticationResult & { AccessToken: string }): LoginResult {
  let claims: Record<string, unknown>;
  try {
    claims = decodeClaims(auth.AccessToken);
  } catch {
    return failure('unexpected', 'Cognito answered with an access token that cannot be read');
  }
  const { username, exp } = claims;
  const groups = claims['cognito:groups'];
  if (typeof username !== 'string' || typeof exp !== 'number') {
    return failure('unexpected', 'The access token has no username or expiry');
  }
  // Without them the session could not be shown as complete, nor refreshed later.
  if (!auth.IdToken || !auth.RefreshToken) {
    return failure('unexpected', 'Cognito answered without an id token or a refresh token');
  }
  const role = resolveRole(Array.isArray(groups) ? groups.filter((g): g is string => typeof g === 'string') : []);
  if (role === null) {
    return failure('no_role', 'This account is in no group: it cannot use the application');
  }
  return {
    status: 'success',
    session: {
      username,
      role,
      accessToken: auth.AccessToken,
      idToken: auth.IdToken,
      refreshToken: auth.RefreshToken,
      expiresAt: new Date(exp * 1000),
    },
  };
}
