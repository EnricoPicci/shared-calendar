import type { ApiErrorCode, AvailabilityType } from '@shared-calendar/shared';
import type { ApiFailure, TransportFailureReason } from './api';

// docs/FRONTEND_SERVICES.md section 16.3. Routes 3–6; their codes are architecture section 4's.
// `type_not_found` is one reason for its 404 (path) and its 409 (body) alike (decision 32).

// GET /calendar/types, both roles.
type LoadCode = Extract<ApiErrorCode, 'forbidden' | 'internal_error'>;
export type TypesFailureReason = LoadCode | TransportFailureReason;
export type TypesResult = { status: 'success'; types: AvailabilityType[] } | ApiFailure<LoadCode>;
export type TypesState = { status: 'idle' } | { status: 'pending' } | TypesResult;

// POST /calendar/types, admin only.
type CreateCode = Extract<
  ApiErrorCode,
  'forbidden' | 'invalid_json' | 'invalid_request' | 'type_name_exists' | 'limit_reached' | 'concurrent_update' | 'internal_error'
>;
export type CreateTypeFailureReason = CreateCode | TransportFailureReason;
export type CreateTypeResult = { status: 'success'; type: AvailabilityType } | ApiFailure<CreateCode>;
export type CreateTypeState = { status: 'idle' } | { status: 'pending'; name: string } | CreateTypeResult;

// PUT /calendar/types/{typeId}, admin only.
type RenameCode = Extract<
  ApiErrorCode,
  'forbidden' | 'invalid_json' | 'invalid_request' | 'type_not_found' | 'type_name_exists' | 'concurrent_update' | 'internal_error'
>;
export type RenameTypeFailureReason = RenameCode | TransportFailureReason;
export type RenameTypeResult = { status: 'success'; type: AvailabilityType } | ApiFailure<RenameCode>;
export type RenameTypeState = { status: 'idle' } | { status: 'pending'; typeId: string; name: string } | RenameTypeResult;

// DELETE /calendar/types/{typeId}, admin only. The 204 has no body: the success carries the id of the call.
type RemoveCode = Extract<ApiErrorCode, 'forbidden' | 'invalid_request' | 'type_not_found' | 'type_in_use' | 'concurrent_update' | 'internal_error'>;
export type RemoveTypeFailureReason = RemoveCode | TransportFailureReason;
export type RemoveTypeResult = { status: 'success'; typeId: string } | ApiFailure<RemoveCode>;
export type RemoveTypeState = { status: 'idle' } | { status: 'pending'; typeId: string } | RemoveTypeResult;
