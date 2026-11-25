import type { ApiErrorCode, MailCalendarBody } from '@shared-calendar/shared';
import type { ApiFailure, TransportFailureReason } from './api';

// The result and state types of MailService (docs/FRONTEND_SERVICES.md section 24).

// POST /mail/calendar: the mail of a range of dates, for both roles (docs/EMAIL_ARCHITECTURE.md
// section 9.1). Its success says only that the mail was asked for: it comes a little later.
type SendCalendarCode = Extract<
  ApiErrorCode,
  'forbidden' | 'invalid_request' | 'invalid_json' | 'user_not_found' | 'no_email_address' | 'mail_limit_reached' | 'mail_unavailable' | 'internal_error'
>;
export type SendCalendarFailureReason = SendCalendarCode | TransportFailureReason;
export type SendCalendarResult = { status: 'success' } | ApiFailure<SendCalendarCode>;
export type SendCalendarState = { status: 'idle' } | { status: 'pending'; range: MailCalendarBody } | SendCalendarResult;
