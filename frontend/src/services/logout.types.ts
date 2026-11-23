import type { RevokeFailureReason } from './cognito';

// The result and state types of LogoutService (docs/FRONTEND_SERVICES.md section 20.3).

// Why Cognito did not revoke the refresh token. Never why the person was not signed out: the
// page forgets the person in every case.
export type LogoutFailureReason =
  | 'not_signed_in' // the store was empty at the press: nothing to revoke, no request
  | RevokeFailureReason // what Cognito's answer says: token_rejected, not_enabled, too_many_attempts, server, unexpected
  | 'timeout' // no whole answer within the time limit: the request was given up
  | 'network'; // fetch rejected: offline, DNS, CORS, refused

// `success`: Cognito answered 200, the refresh token is revoked. `failure`: it is not known to
// be revoked, and at Cognito it may live on until it expires. Neither holds a token or a name
// (docs/FRONTEND_SERVICES.md section 8, decision 46).
export type LogoutResult = { status: 'success' } | { status: 'failure'; reason: LogoutFailureReason; message: string };

export type LogoutState = { status: 'idle' } | { status: 'pending' } | LogoutResult;
