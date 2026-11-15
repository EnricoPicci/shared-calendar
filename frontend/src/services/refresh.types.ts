// The result and state types of RefreshService (docs/FRONTEND_SERVICES.md section 11.3).

export type RefreshFailureReason =
  | 'not_signed_in' // the store is empty: nothing to refresh, no request
  // NotAuthorizedException, UserNotFoundException: refresh token expired, revoked or unknown.
  | 'session_rejected'
  | 'no_role' // the new access token is in neither group (docs/FRONTEND_SERVICES.md section 8, decision 20)
  | 'too_many_attempts' // TooManyRequestsException, LimitExceededException
  | 'network' // fetch rejected
  | 'server' // 5xx, or a body that is not JSON
  | 'unexpected'; // anything else, including a challenge or PasswordResetRequiredException

// A success carries no token: the new session is in the store (docs/FRONTEND_SERVICES.md section 2,
// rule 9, and docs/FRONTEND_SERVICES.md section 8, decision 19).
export type RefreshResult =
  | { status: 'success'; username: string; expiresAt: Date }
  | { status: 'failure'; reason: RefreshFailureReason; message: string };

export type RefreshState = { status: 'idle' } | { status: 'pending' } | RefreshResult;
