import type { Role } from '@shared-calendar/shared';

// docs/FRONTEND_SERVICES.md section 4.3.

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
  | 'challenge' // 200 without AuthenticationResult (cannot happen in v1)
  | 'no_role' // signed in, but in neither group: the API would answer 403 to everything
  | 'network' // fetch rejected: offline, DNS, CORS, refused
  | 'server' // HTTP 5xx, or a body that is not JSON
  | 'unexpected'; // any other __type, or an access token whose claims cannot be read

// The success carries no token: the Session goes to the SessionStore only (rule 9, decision 28).
export type LoginResult =
  | { status: 'success'; username: string; role: Role; expiresAt: Date }
  // message: human text for the view, never the password.
  | { status: 'failure'; reason: LoginFailureReason; message: string };

export type LoginState = { status: 'idle' } | { status: 'pending'; username: string } | LoginResult;
