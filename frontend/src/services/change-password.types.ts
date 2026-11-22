import type { PasswordProblem } from '@shared-calendar/shared';

// The types of ChangePasswordService (docs/FRONTEND_SERVICES.md section 21.3).

// Where the change is posted, and whether the sign-out everywhere that follows it is skipped: the
// local stack's Cognito emulator cannot do it (docs/ARCHITECTURE.md section 8), the cloud always
// does it.
export type ChangePasswordConfig = {
  cognitoUrl: string; // 'https://cognito-idp.eu-north-1.amazonaws.com/' or 'http://localhost:9229/'
  skipGlobalSignOut: boolean; // true only against the local stack
};

// What a new password can miss: the conditions of the shared rule, and being the current
// password again, which Cognito would accept since the pool keeps no password history
// (docs/FRONTEND_SERVICES.md section 8, decision 51).
export type NewPasswordProblem = PasswordProblem | 'same_as_current';

export type ChangePasswordFailureReason =
  | 'not_signed_in' // the store is empty: no request
  | 'new_password_refused' // the shared rule or the current password refuses it: no request
  // NotAuthorizedException (real Cognito), InvalidPasswordException (cognito-local), and a token
  // Cognito no longer accepts (docs/ARCHITECTURE.md section 6.9).
  | 'wrong_current_password'
  | 'too_many_attempts' // LimitExceededException, TooManyRequestsException
  | 'network' // fetch rejected: offline, DNS, CORS, refused
  | 'server' // 5xx, or a failure whose body is not JSON
  | 'unexpected'; // any other answer, PasswordHistoryPolicyViolationException included

// The success carries nothing, whatever the sign-out everywhere did (docs/FRONTEND_SERVICES.md
// section 8, decision 52). No value holds a password or a token (docs/FRONTEND_SERVICES.md
// section 2, rules 6 and 9); `message` is a text for people, never a password.
export type ChangePasswordResult =
  | { status: 'success' }
  | { status: 'failure'; reason: 'new_password_refused'; message: string; problems: NewPasswordProblem[] }
  | { status: 'failure'; reason: Exclude<ChangePasswordFailureReason, 'new_password_refused'>; message: string };

// `pending` carries nothing: both arguments are passwords.
export type ChangePasswordState = { status: 'idle' } | { status: 'pending' } | ChangePasswordResult;
