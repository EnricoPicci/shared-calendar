import type { ApiErrorCode, CreateUserResponse, UserSummary } from '@shared-calendar/shared';
import type { ApiFailure, TransportFailureReason } from './api';

// docs/FRONTEND_SERVICES.md section 13.3.

export type CreateUserFailureReason =
  | Extract<ApiErrorCode, 'forbidden' | 'invalid_json' | 'invalid_request' | 'user_exists' | 'internal_error'>
  | TransportFailureReason;
export type DeleteUserFailureReason =
  | Extract<ApiErrorCode, 'forbidden' | 'invalid_request' | 'cannot_delete_admin' | 'user_not_found' | 'concurrent_update' | 'internal_error'>
  | TransportFailureReason;

// The success carries the generated password: the one exception of rule 6 (section 13.7).
export type CreateUserResult =
  | { status: 'success'; user: CreateUserResponse }
  | { status: 'failure'; reason: CreateUserFailureReason; message: string };
export type CreateUserState = { status: 'idle' } | { status: 'pending'; username: string } | CreateUserResult;

// The 204 has no body; the success names the account of the call (decision 24).
export type DeleteUserResult =
  | { status: 'success'; username: string }
  | { status: 'failure'; reason: DeleteUserFailureReason; message: string };
export type DeleteUserState = { status: 'idle' } | { status: 'pending'; username: string } | DeleteUserResult;

// GET /users (v6): the plain Users, never an administrator (spec 10.1).
type ListUsersCode = Extract<ApiErrorCode, 'forbidden' | 'internal_error'>;
export type ListUsersFailureReason = ListUsersCode | TransportFailureReason;
export type ListUsersResult = { status: 'success'; users: UserSummary[] } | ApiFailure<ListUsersCode>;
export type ListUsersState = { status: 'idle' } | { status: 'pending' } | ListUsersResult;
