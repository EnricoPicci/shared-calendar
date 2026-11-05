// docs/FRONTEND_SERVICES.md section 11.3.

export type RefreshFailureReason =
  | 'not_signed_in' // the store is empty: nothing to refresh, no request
  | 'session_rejected' // NotAuthorizedException, UserNotFoundException: refresh token expired, revoked or unknown
  | 'no_role' // the new access token is in neither group (decision 20)
  | 'too_many_attempts' // TooManyRequestsException, LimitExceededException
  | 'network' // fetch rejected
  | 'server' // 5xx, or a body that is not JSON
  | 'unexpected'; // anything else, including a challenge or PasswordResetRequiredException

// A success carries no token: the new session is in the store (rule 9, decision 19).
export type RefreshResult =
  | { status: 'success'; username: string; expiresAt: Date }
  | { status: 'failure'; reason: RefreshFailureReason; message: string };

export type RefreshState = { status: 'idle' } | { status: 'pending' } | RefreshResult;
