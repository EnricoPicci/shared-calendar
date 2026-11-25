import type { PasswordProblem, Role } from '@shared-calendar/shared';

// The types of LoginService and the Session (docs/FRONTEND_SERVICES.md section 4.3).

// What a signed-in user is, for the whole front end.
export type Session = {
  username: string; // claim `username` of the access token: the <UserName> of the Hello message
  role: Role; // from claim `cognito:groups`, resolved with the shared "admin wins" rule
  accessToken: string; // sent as Authorization: Bearer on every API call
  idToken: string;
  refreshToken: string; // for RefreshService (REFRESH_TOKEN_AUTH, 7 days)
  expiresAt: Date; // claim `exp` of the access token (15 minutes)
};

export type LoginFailureReason =
  | 'invalid_credentials' // NotAuthorizedException, UserNotFoundException (InvalidPasswordException locally)
  | 'too_many_attempts' // TooManyRequestsException, LimitExceededException
  | 'password_reset_required' // PasswordResetRequiredException (cannot happen in v1; mapped anyway)
  | 'challenge' // 200 without AuthenticationResult, for any challenge but NEW_PASSWORD_REQUIRED
  // The answer to NEW_PASSWORD_REQUIRED came after Cognito's 3 minutes: the person signs in again
  // (docs/FRONTEND_SERVICES.md section 4.9).
  | 'session_expired'
  | 'no_role' // signed in, but in neither group: the API would answer 403 to everything
  | 'network' // fetch rejected: offline, DNS, CORS, refused
  | 'server' // HTTP 5xx, or a body that is not JSON
  | 'unexpected'; // any other __type, or an access token whose claims cannot be read

// Why a new password was not taken while the challenge NEW_PASSWORD_REQUIRED stays open
// (docs/FRONTEND_SERVICES.md section 4.9): the shared rule refused it before any request, with
// its problems; or Cognito refused it (`password_refused`), or could not be asked.
export type NewPasswordRefusal =
  | { reason: 'new_password_refused'; problems: PasswordProblem[] }
  | { reason: 'password_refused' | 'too_many_attempts' | 'network' | 'server' | 'unexpected'; message: string };

// The success carries no token: the Session goes to the SessionStore only
// (docs/FRONTEND_SERVICES.md section 2, rule 9, and docs/FRONTEND_SERVICES.md section 8, decision 28).
export type LoginResult =
  | { status: 'success'; username: string; role: Role; expiresAt: Date }
  // message: human text for the view, never the password.
  | { status: 'failure'; reason: LoginFailureReason; message: string }
  // The password is temporary: a new one is needed before Cognito gives a token. The challenge's
  // session stays inside the service; `refusal` says why the last new password was not taken.
  | { status: 'new_password_required'; username: string; refusal?: NewPasswordRefusal };

// `answering`: a new password is on its way to Cognito. Neither it nor the challenge's session
// is in a state.
export type LoginState =
  | { status: 'idle' }
  | { status: 'pending'; username: string }
  | { status: 'answering'; username: string }
  | LoginResult;
