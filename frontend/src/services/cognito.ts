import { resolveRole } from '@shared-calendar/shared';
import { Observable } from 'rxjs';
import { fromFetch } from 'rxjs/fetch';
import { decodeClaims } from './jwt';
import type { Session } from './login.types';

// docs/FRONTEND_SERVICES.md section 10.1. What LoginService and RefreshService share: the
// InitiateAuth request, the mapping of Cognito's answer (section 4.5) and toSession.

export type CognitoConfig = {
  cognitoUrl: string; // 'https://cognito-idp.eu-north-1.amazonaws.com/' or 'http://localhost:9229/'
  clientId: string; // UserPoolClientId output of the back-end stack, or CLIENT_ID of env.local.json
};

// Cognito's failures before a service names them for its view (decision 15).
export type AuthFailureReason =
  | 'not_authorized' // NotAuthorizedException, UserNotFoundException, InvalidPasswordException (cognito-local)
  | 'too_many_attempts' // TooManyRequestsException, LimitExceededException
  | 'password_reset_required' // PasswordResetRequiredException
  | 'challenge' // 200 without AuthenticationResult
  | 'no_role' // the access token is in neither group
  | 'server' // 5xx, or a body that is not JSON
  | 'unexpected'; // any other __type; an access token whose claims cannot be read

// Internal to the two Cognito services: the session in a success goes straight to the store,
// and only a token-free outcome reaches a subject (rule 9).
export type AuthOutcome =
  | { status: 'success'; session: Session }
  | { status: 'failure'; reason: AuthFailureReason; message: string };

// The request. Emits one { status, text } and completes; errors only when fetch rejects.
export function initiateAuth(
  config: CognitoConfig,
  flow: 'USER_PASSWORD_AUTH' | 'REFRESH_TOKEN_AUTH',
  parameters: Record<string, string>,
): Observable<{ status: number; text: string }> {
  return fromFetch(config.cognitoUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({ AuthFlow: flow, ClientId: config.clientId, AuthParameters: parameters }),
    // Read the body inside the stream, so that unsubscribing also abandons the body read.
    selector: (response) => response.text().then((text) => ({ status: response.status, text })),
  });
}

// For the network failure: the error name and text, which never include the request body.
export function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

// The two bodies Cognito can answer with (section 4.1).
type AuthenticationResult = { AccessToken?: string; IdToken?: string; RefreshToken?: string; ExpiresIn?: number };
type InitiateAuthResponse = { AuthenticationResult?: AuthenticationResult; ChallengeName?: string };
type CognitoError = { __type?: string; message?: string };

function failure(reason: AuthFailureReason, message: string): AuthOutcome {
  return { status: 'failure', reason, message };
}

const REASON_BY_TYPE: Record<string, AuthFailureReason> = {
  NotAuthorizedException: 'not_authorized',
  UserNotFoundException: 'not_authorized',
  // cognito-local's answer to a wrong password; real Cognito's InitiateAuth never returns it.
  InvalidPasswordException: 'not_authorized',
  TooManyRequestsException: 'too_many_attempts',
  LimitExceededException: 'too_many_attempts',
  PasswordResetRequiredException: 'password_reset_required',
};

// The mapping of section 4.5. `refreshToken` is kept when the answer carries none (the refresh
// flow, decision 21); without it, a missing RefreshToken is `unexpected`, as for the login.
export function toAuthOutcome(status: number, text: string, refreshToken?: string): AuthOutcome {
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
    return toSession(auth as AuthenticationResult & { AccessToken: string }, refreshToken);
  }
  const error = body as CognitoError;
  // __type may carry a namespace prefix ("com.amazonaws…#NotAuthorizedException").
  const type = String(error.__type ?? '').split('#').pop() ?? '';
  const reason = REASON_BY_TYPE[type] ?? (status >= 500 ? 'server' : 'unexpected');
  return failure(reason, error.message ?? `Cognito answered ${status}`);
}

// Reads username, cognito:groups and exp from the access token. A token whose claims cannot be
// read is an `unexpected` failure (not a thrown error, which catchError would call `network`).
function toSession(auth: AuthenticationResult & { AccessToken: string }, keptRefreshToken?: string): AuthOutcome {
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
  // A rotated refresh token wins over the kept one (decision 21).
  const refreshToken = auth.RefreshToken ?? keptRefreshToken;
  // Without them the session could not be shown as complete, nor refreshed later.
  if (!auth.IdToken || !refreshToken) {
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
      refreshToken,
      expiresAt: new Date(exp * 1000),
    },
  };
}
