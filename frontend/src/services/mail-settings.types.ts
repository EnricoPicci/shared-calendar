import type { ApiErrorCode, MailSettings, MailSettingsBody } from '@shared-calendar/shared';
import type { ApiFailure, TransportFailureReason } from './api';

// The result and state types of MailSettingsService (docs/FRONTEND_SERVICES.md section 25), for
// GET and PUT /mail/settings (docs/EMAIL_ARCHITECTURE.md section 9.1), the Administrator's. Both
// answer `503 mail_unavailable` in a stack where e-mail is not switched on yet.

// GET /mail/settings.
type GetCode = Extract<ApiErrorCode, 'forbidden' | 'mail_unavailable' | 'internal_error'>;
export type MailSettingsFailureReason = GetCode | TransportFailureReason;
export type MailSettingsResult = { status: 'success'; settings: MailSettings } | ApiFailure<GetCode>;
// A read has no argument, so its pending state carries nothing
// (docs/FRONTEND_SERVICES.md section 8, decision 31).
export type MailSettingsState = { status: 'idle' } | { status: 'pending' } | MailSettingsResult;

// PUT /mail/settings.
type UpdateCode = Extract<ApiErrorCode, 'forbidden' | 'invalid_json' | 'invalid_request' | 'mail_unavailable' | 'internal_error'>;
export type UpdateMailSettingsFailureReason = UpdateCode | TransportFailureReason;
export type UpdateMailSettingsResult = { status: 'success'; settings: MailSettings } | ApiFailure<UpdateCode>;
export type UpdateMailSettingsState = { status: 'idle' } | { status: 'pending'; settings: MailSettingsBody } | UpdateMailSettingsResult;
