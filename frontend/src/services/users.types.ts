import type { ApiErrorCode, CreateUserResponse, UserSummary } from '@shared-calendar/shared';
import type { ApiFailure, TransportFailureReason } from './api';

// The result and state types of UsersService (docs/FRONTEND_SERVICES.md section 13.3).

export type CreateUserFailureReason =
  | Extract<ApiErrorCode, 'forbidden' | 'invalid_json' | 'invalid_request' | 'user_exists' | 'internal_error'>
  | TransportFailureReason;
// PUT /users/{username}: the four facts of a User, or the Administrator's own
// (docs/EMAIL_ARCHITECTURE.md section 9.1).
type UpdateUserCode = Extract<ApiErrorCode, 'forbidden' | 'invalid_json' | 'invalid_request' | 'user_not_found' | 'cannot_edit_admin' | 'internal_error'>;
export type UpdateUserFailureReason = UpdateUserCode | TransportFailureReason;
export type UpdateUserResult = { status: 'success'; user: UserSummary } | ApiFailure<UpdateUserCode>;
export type UpdateUserState = { status: 'idle' } | { status: 'pending'; username: string } | UpdateUserResult;

export type DeleteUserFailureReason =
  | Extract<ApiErrorCode, 'forbidden' | 'invalid_request' | 'cannot_delete_admin' | 'user_not_found' | 'concurrent_update' | 'internal_error'>
  | TransportFailureReason;

// The success carries the generated password: the one exception to docs/FRONTEND_SERVICES.md
// section 2, rule 6 (docs/FRONTEND_SERVICES.md section 13.7).
export type CreateUserResult =
  | { status: 'success'; user: CreateUserResponse }
  | { status: 'failure'; reason: CreateUserFailureReason; message: string };
export type CreateUserState = { status: 'idle' } | { status: 'pending'; username: string } | CreateUserResult;

// The 204 has no body, so the success names the account the call was made for
// (docs/FRONTEND_SERVICES.md section 8, decision 24).
export type DeleteUserResult =
  | { status: 'success'; username: string }
  | { status: 'failure'; reason: DeleteUserFailureReason; message: string };
export type DeleteUserState = { status: 'idle' } | { status: 'pending'; username: string } | DeleteUserResult;

// GET /users: the plain Users, never an administrator (docs/SHARED_CALENDAR_SPEC.md section 10.1).
type ListUsersCode = Extract<ApiErrorCode, 'forbidden' | 'internal_error'>;
export type ListUsersFailureReason = ListUsersCode | TransportFailureReason;
export type ListUsersResult = { status: 'success'; users: UserSummary[] } | ApiFailure<ListUsersCode>;
export type ListUsersState = { status: 'idle' } | { status: 'pending' } | ListUsersResult;
