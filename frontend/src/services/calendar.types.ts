import type { ApiErrorCode, CalendarView } from '@shared-calendar/shared';
import type { ApiFailure, TransportFailureReason } from './api';

// The result and state types of CalendarService (docs/FRONTEND_SERVICES.md section 18.3), for
// docs/SHARED_CALENDAR_SPEC.md section 11.1, route 15, with the error codes of
// docs/ARCHITECTURE.md section 4.

// GET /calendar?from&to, both roles. The view is built by the server for the caller's role
// (docs/SHARED_CALENDAR_SPEC.md section 11.6): the success carries it as received.
type CalendarCode = Extract<ApiErrorCode, 'forbidden' | 'invalid_request' | 'internal_error'>;
export type CalendarFailureReason = CalendarCode | TransportFailureReason;
export type CalendarResult = { status: 'success'; calendar: CalendarView } | ApiFailure<CalendarCode>;
// `load` and `reload` share the pair. Pending carries the range being loaded; a `reload` before any
// `load` has no range, so its pending carries nothing (docs/FRONTEND_SERVICES.md section 8,
// decision 39).
export type CalendarState =
  | { status: 'idle' }
  | { status: 'pending'; from: string; to: string }
  | { status: 'pending' }
  | CalendarResult;
