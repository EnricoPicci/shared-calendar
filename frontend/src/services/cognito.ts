import { resolveRole } from '@shared-calendar/shared';
import { Observable } from 'rxjs';
import { fromFetch } from 'rxjs/fetch';
import { decodeClaims } from './jwt';
import type { Session } from './login.types';

// What the services that talk to Cognito share (docs/FRONTEND_SERVICES.md section 10.1): one
// request for any target of Cognito's user-pool API and the reading of its answer; for
// LoginService and RefreshService the InitiateAuth request, the mapping of its answer
// (docs/FRONTEND_SERVICES.md section 4.5) and toSession; for LoginService also the challenge
// NEW_PASSWORD_REQUIRED and its answer, RespondToAuthChallenge (docs/FRONTEND_SERVICES.md
// section 4.9); for LogoutService the RevokeToken request and the reading of its answer
// (docs/FRONTEND_SERVICES.md section 20.5).

export type CognitoConfig = {
  cognitoUrl: string; // 'https://cognito-idp.eu-north-1.amazonaws.com/' or 'http://localhost:9229/'
  clientId: string; // UserPoolClientId output of the back-end stack, or CLIENT_ID of env.local.json
};

// Cognito's failures in neutral terms; each service renames them for its view, e.g.
// `not_authorized` is a wrong password for a login (docs/FRONTEND_SERVICES.md section 8, decision 15).
export type AuthFailureReason =
  // NotAuthorizedException, UserNotFoundException, InvalidPasswordException (cognito-local).
  | 'not_authorized'
  | 'too_many_attempts' // TooManyRequestsException, LimitExceededException
  | 'password_reset_required' // PasswordResetRequiredException
  | 'challenge' // 200 without AuthenticationResult, for any challenge but NEW_PASSWORD_REQUIRED
  | 'no_role' // the access token is in neither group
  | 'server' // 5xx, or a body that is not JSON
  | 'unexpected'; // any other __type; an access token whose claims cannot be read

// Internal to the two Cognito services: the session in a success goes straight to the store,
// and only a token-free outcome reaches a subject (docs/FRONTEND_SERVICES.md section 2, rule 9).
export type AuthOutcome =
  | { status: 'success'; session: Session }
  | { status: 'failure'; reason: AuthFailureReason; message: string };

// The targets of Cognito's user-pool API the front end calls: the sign-in and the refresh, the
// answer to the challenge of a temporary password, the revocation of a refresh token at sign-out,
// a person's change of their own password with the sign-out everywhere that follows it
// (docs/ARCHITECTURE.md section 6.9), and the read and the write of the person's own language
// (docs/MULTILANGUAGE_PLAN.md finding F11).
export type CognitoTarget = 'InitiateAuth' | 'RespondToAuthChallenge' | 'RevokeToken' | 'ChangePassword' | 'GlobalSignOut' | 'GetUser' | 'UpdateUserAttributes';

// One request to Cognito: JSON over HTTPS, the action named in a header, no signing and no secret.
// Emits one { status, text } and completes; errors only when fetch rejects. The body holds
// passwords or tokens: it goes into the request and nowhere else. `init` adds what one request
// needs and the others do not, such as `keepalive` for the revocation.
export function cognitoRequest(
  config: Pick<CognitoConfig, 'cognitoUrl'>,
  target: CognitoTarget,
  body: Record<string, unknown>,
  init: RequestInit = {},
): Observable<{ status: number; text: string }> {
  return fromFetch(config.cognitoUrl, {
    ...init,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
    // Read the body inside the stream, so that unsubscribing also abandons the body read.
    selector: (response) => response.text().then((text) => ({ status: response.status, text })),
  });
}

// Asks Cognito to revoke a refresh token, so that it makes no new access token. The app client
// has no secret, so the body is the client id and the token and nothing else, and the request
// carries no credentials (docs/FRONTEND_SERVICES.md section 20.1). `keepalive` lets the browser
// finish the request when the page is closed straight after it was sent
// (docs/FRONTEND_SERVICES.md section 8, decision 56).
export function revokeToken(config: CognitoConfig, refreshToken: string): Observable<{ status: number; text: string }> {
  return cognitoRequest(config, 'RevokeToken', { ClientId: config.clientId, Token: refreshToken }, { keepalive: true });
}

// The sign-in or the refresh: InitiateAuth with the app client's id and the flow's parameters.
export function initiateAuth(
  config: CognitoConfig,
  flow: 'USER_PASSWORD_AUTH' | 'REFRESH_TOKEN_AUTH',
  parameters: Record<string, string>,
): Observable<{ status: number; text: string }> {
  return cognitoRequest(config, 'InitiateAuth', { AuthFlow: flow, ClientId: config.clientId, AuthParameters: parameters });
}

// The answer to the challenge NEW_PASSWORD_REQUIRED: the person's username, the new password and
// the challenge's session, which Cognito gave with the challenge (docs/FRONTEND_SERVICES.md
// section 4.9). The body holds a password and a session: it goes into the request and nowhere else.
export function respondToNewPassword(
  config: CognitoConfig,
  username: string,
  newPassword: string,
  session: string,
): Observable<{ status: number; text: string }> {
  return cognitoRequest(config, 'RespondToAuthChallenge', {
    ChallengeName: 'NEW_PASSWORD_REQUIRED',
    ClientId: config.clientId,
    Session: session,
    ChallengeResponses: { USERNAME: username, NEW_PASSWORD: newPassword },
  });
}

// The body of Cognito's answer: the parsed object, an empty object for JSON that is not an object
// (null, a number), or undefined when the text is not JSON at all.
export function readCognitoBody(text: string): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
}

// The error class of a failed answer, without the namespace prefix `__type` may carry
// ("com.amazonaws…#NotAuthorizedException"), and its message; '' and undefined when absent.
export function readCognitoError(body: Record<string, unknown>): { type: string; message?: string } {
  const error = body as CognitoError;
  const type = String(error.__type ?? '').split('#').pop() ?? '';
  return { type, message: typeof error.message === 'string' ? error.message : undefined };
}

// For the network failure: the error name and text, which never include the request body.
export function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

// The two bodies Cognito can answer with (docs/FRONTEND_SERVICES.md section 4.1).
type AuthenticationResult = { AccessToken?: string; IdToken?: string; RefreshToken?: string; ExpiresIn?: number };
type InitiateAuthResponse = { AuthenticationResult?: AuthenticationResult; ChallengeName?: string; Session?: string };
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

// Maps Cognito's answer as in docs/FRONTEND_SERVICES.md section 4.5. A refresh passes the
// `refreshToken` it already has, which is kept when the answer carries none
// (docs/FRONTEND_SERVICES.md section 8, decision 21); a login passes none, so a missing
// RefreshToken is `unexpected`.
export function toAuthOutcome(status: number, text: string, refreshToken?: string): AuthOutcome {
  const body = readCognitoBody(text);
  if (body === undefined) return failure('server', `Cognito answered ${status} without JSON`);

  if (status === 200) {
    const auth = (body as InitiateAuthResponse).AuthenticationResult;
    if (!auth?.AccessToken) return failure('challenge', 'Cognito asked for a challenge');
    return toSession(auth as AuthenticationResult & { AccessToken: string }, refreshToken);
  }
  const { type, message } = readCognitoError(body);
  const reason = REASON_BY_TYPE[type] ?? (status >= 500 ? 'server' : 'unexpected');
  return failure(reason, message ?? `Cognito answered ${status}`);
}

// The sign-in's outcome: an AuthOutcome, or the challenge NEW_PASSWORD_REQUIRED of an account
// whose password is temporary, with the challenge's session (docs/FRONTEND_SERVICES.md section
// 4.9). Internal to LoginService, which keeps the session to itself: it is a secret for 3 minutes.
export type SignInOutcome = AuthOutcome | { status: 'new_password_required'; session: string };

// Reads Cognito's answer to InitiateAuth with USER_PASSWORD_AUTH. Only NEW_PASSWORD_REQUIRED with a
// session is told apart; any other challenge stays the failure `challenge` of toAuthOutcome.
export function toSignInOutcome(status: number, text: string): SignInOutcome {
  if (status === 200) {
    const body = readCognitoBody(text) as InitiateAuthResponse | undefined;
    if (body?.ChallengeName === 'NEW_PASSWORD_REQUIRED' && typeof body.Session === 'string' && body.Session !== '') {
      return { status: 'new_password_required', session: body.Session };
    }
  }
  return toAuthOutcome(status, text);
}

// What a refused answer to the challenge leaves open: the person may try again with the same
// challenge (docs/FRONTEND_SERVICES.md section 4.9).
export type ChallengeRefusalReason = 'password_refused' | 'too_many_attempts' | 'server' | 'unexpected';

// The answer's outcome. Tokens give an AuthOutcome, as a sign-in does. `expired` is a session
// Cognito no longer takes, its 3 minutes over: the challenge is gone and the person signs in
// again. `refused` leaves the challenge open.
export type ChallengeOutcome =
  | AuthOutcome
  | { status: 'expired'; message: string }
  | { status: 'refused'; reason: ChallengeRefusalReason; message: string };

// The error types of RespondToAuthChallenge read for the challenge NEW_PASSWORD_REQUIRED. Cognito
// answers a session it no longer takes with NotAuthorizedException; ExpiredCodeException is read
// the same way. cognito-local checks neither the session nor the pool's rule
// (docs/EMAIL_ARCHITECTURE.md section 14.1), so locally only tokens come back.
const CHALLENGE_REFUSAL_BY_TYPE: Record<string, ChallengeRefusalReason | 'expired'> = {
  NotAuthorizedException: 'expired',
  ExpiredCodeException: 'expired',
  InvalidPasswordException: 'password_refused',
  TooManyRequestsException: 'too_many_attempts',
  LimitExceededException: 'too_many_attempts',
};

// Reads Cognito's answer to RespondToAuthChallenge. A 200 is read as a sign-in's answer; a
// refusal's message is Cognito's own, as for a sign-in, and never quotes the password.
export function toChallengeOutcome(status: number, text: string): ChallengeOutcome {
  if (status === 200) return toAuthOutcome(status, text);
  const body = readCognitoBody(text);
  if (body === undefined) return { status: 'refused', reason: 'server', message: `Cognito answered ${status} without JSON` };
  const { type, message = `Cognito answered ${status}` } = readCognitoError(body);
  const known = CHALLENGE_REFUSAL_BY_TYPE[type] ?? (status >= 500 ? 'server' : 'unexpected');
  return known === 'expired' ? { status: 'expired', message } : { status: 'refused', reason: known, message };
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
  // A rotated refresh token wins over the kept one (docs/FRONTEND_SERVICES.md section 8, decision 21).
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

// Why Cognito did not revoke, as far as its answer says (docs/FRONTEND_SERVICES.md section 20.5).
export type RevokeFailureReason =
  | 'token_rejected' // Cognito did not take the token: not a refresh token, or not one it knows
  | 'not_enabled' // revocation is switched off for the app client, or not offered
  | 'too_many_attempts'
  | 'server' // 5xx, or a failure whose body is not JSON
  | 'unexpected'; // any other error type

export type RevokeOutcome = { status: 'success' } | { status: 'failure'; reason: RevokeFailureReason; message: string };

// The error types RevokeToken can answer with: those AWS's API reference lists for the
// operation, ThrottlingException of its common errors, and the two cognito-local uses
// (NotAuthorizedException for a token already revoked or unknown, ResourceNotFoundException
// for an unknown client id). A Map, so that only a type written here is ever found.
const REVOKE_REASON_BY_TYPE = new Map<string, RevokeFailureReason>([
  ['UnauthorizedException', 'token_rejected'],
  ['UnsupportedTokenTypeException', 'token_rejected'],
  ['NotAuthorizedException', 'token_rejected'],
  ['UnsupportedOperationException', 'not_enabled'],
  ['OperationNotEnabledException', 'not_enabled'],
  ['TooManyRequestsException', 'too_many_attempts'],
  ['ThrottlingException', 'too_many_attempts'],
  ['InternalErrorException', 'server'],
  ['InvalidParameterException', 'unexpected'],
  ['ForbiddenException', 'unexpected'],
  ['ResourceNotFoundException', 'unexpected'],
]);

// Reads Cognito's answer to RevokeToken. A 200 is a success whatever its body. The message of
// a failure is written here, from the status and from a type of the list above: Cognito's own
// message is never copied and a type outside the list is not named, because an error of AWS
// can quote the value it refuses, and the only value of this request is the refresh token
// (docs/FRONTEND_SERVICES.md section 8, decision 55).
export function toRevokeOutcome(status: number, text: string): RevokeOutcome {
  if (status === 200) return { status: 'success' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { status: 'failure', reason: 'server', message: `Cognito answered ${status} without JSON` };
  }
  // A JSON answer that is not an object (null, a number) is read as an empty object.
  const body = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as CognitoError;
  // __type may carry a namespace prefix ("com.amazonaws…#UnauthorizedException").
  const type = String(body.__type ?? '').split('#').pop() as string;
  const known = REVOKE_REASON_BY_TYPE.get(type);
  if (known !== undefined) return { status: 'failure', reason: known, message: `Cognito answered ${status} ${type}` };
  return { status: 'failure', reason: status >= 500 ? 'server' : 'unexpected', message: `Cognito answered ${status}` };
}
