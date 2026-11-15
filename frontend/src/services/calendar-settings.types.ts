import type { ApiErrorCode, CalendarSettings, UpdateSettingsBody } from '@shared-calendar/shared';
import type { ApiFailure, TransportFailureReason } from './api';

// The result and state types of CalendarSettingsService (docs/FRONTEND_SERVICES.md section 15.3),
// for docs/SHARED_CALENDAR_SPEC.md section 11.1, routes 1 and 2, with the error codes of
// docs/ARCHITECTURE.md section 4.

// GET /calendar/settings, both roles.
type LoadCode = Extract<ApiErrorCode, 'forbidden' | 'internal_error'>;
export type SettingsFailureReason = LoadCode | TransportFailureReason;
export type SettingsResult = { status: 'success'; settings: CalendarSettings } | ApiFailure<LoadCode>;
// A load has no argument, so its pending state carries nothing
// (docs/FRONTEND_SERVICES.md section 8, decision 31).
export type SettingsState = { status: 'idle' } | { status: 'pending' } | SettingsResult;

// PUT /calendar/settings, admin only.
type UpdateCode = Extract<ApiErrorCode, 'forbidden' | 'invalid_json' | 'invalid_request' | 'concurrent_update' | 'internal_error'>;
export type UpdateSettingsFailureReason = UpdateCode | TransportFailureReason;
export type UpdateSettingsResult = { status: 'success'; settings: CalendarSettings } | ApiFailure<UpdateCode>;
export type UpdateSettingsState = { status: 'idle' } | { status: 'pending'; settings: UpdateSettingsBody } | UpdateSettingsResult;
