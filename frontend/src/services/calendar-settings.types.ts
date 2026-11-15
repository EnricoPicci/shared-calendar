import type { ApiErrorCode, CalendarSettings, UpdateSettingsBody } from '@shared-calendar/shared';
import type { ApiFailure, TransportFailureReason } from './api';

// docs/FRONTEND_SERVICES.md section 15.3. Routes 1 and 2; their codes are architecture section 4's.

// GET /calendar/settings, both roles.
type LoadCode = Extract<ApiErrorCode, 'forbidden' | 'internal_error'>;
export type SettingsFailureReason = LoadCode | TransportFailureReason;
export type SettingsResult = { status: 'success'; settings: CalendarSettings } | ApiFailure<LoadCode>;
// A load has no argument: its pending carries nothing (decision 31).
export type SettingsState = { status: 'idle' } | { status: 'pending' } | SettingsResult;

// PUT /calendar/settings, admin only.
type UpdateCode = Extract<ApiErrorCode, 'forbidden' | 'invalid_json' | 'invalid_request' | 'concurrent_update' | 'internal_error'>;
export type UpdateSettingsFailureReason = UpdateCode | TransportFailureReason;
export type UpdateSettingsResult = { status: 'success'; settings: CalendarSettings } | ApiFailure<UpdateCode>;
export type UpdateSettingsState = { status: 'idle' } | { status: 'pending'; settings: UpdateSettingsBody } | UpdateSettingsResult;
