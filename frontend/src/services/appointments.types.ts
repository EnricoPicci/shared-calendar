import type { ApiErrorCode, Appointment, AppointmentsQuery, BookBody, ChangeBody } from '@shared-calendar/shared';
import type { ApiFailure, TransportFailureReason } from './api';

// The result and state types of AppointmentsService (docs/FRONTEND_SERVICES.md section 19.3), for
// docs/SHARED_CALENDAR_SPEC.md section 11.1, routes 16–20, with the error codes of
// docs/ARCHITECTURE.md section 4. `user_not_found` is one reason for both of its 404s, an unknown
// target and a deleted User (docs/FRONTEND_SERVICES.md section 8, decision 44).

type Common = 'forbidden' | 'internal_error';
// The timing and availability refusals a booking and a change share (docs/SHARED_CALENDAR_SPEC.md
// section 8.2, R-BOOK-03 to R-BOOK-09).
type BookingRule =
  | 'booking_in_past'
  | 'booking_notice_too_short'
  | 'booking_beyond_horizon'
  | 'outside_availability'
  | 'slot_taken'
  | 'appointment_limit_reached';

// The query of `list` as the caller gives it: `status` may be left out, the shared schema then adds
// its default `booked` (docs/SHARED_CALENDAR_SPEC.md section 11.2).
export type AppointmentsQueryInput = Omit<AppointmentsQuery, 'status'> & { status?: AppointmentsQuery['status'] };

// GET /calendar/appointments, both roles.
type ListCode = Extract<ApiErrorCode, Common | 'invalid_request'>;
export type AppointmentsFailureReason = ListCode | TransportFailureReason;
export type AppointmentsResult = { status: 'success'; appointments: Appointment[] } | ApiFailure<ListCode>;
export type AppointmentsState = { status: 'idle' } | { status: 'pending'; query: AppointmentsQueryInput } | AppointmentsResult;

// POST /calendar/appointments, both roles.
type BookCode = Extract<
  ApiErrorCode,
  Common | 'invalid_json' | 'invalid_request' | 'user_not_found' | 'target_not_user' | BookingRule | 'concurrent_update'
>;
export type BookFailureReason = BookCode | TransportFailureReason;
export type BookResult = { status: 'success'; appointment: Appointment } | ApiFailure<BookCode>;
export type BookState = { status: 'idle' } | { status: 'pending'; booking: BookBody } | BookResult;

// POST /calendar/appointments/{appointmentId}/cancel, the Administrator or the owner.
type CancelCode = Extract<
  ApiErrorCode,
  Common | 'invalid_request' | 'appointment_not_found' | 'appointment_not_active' | 'cancellation_notice_too_short' | 'concurrent_update'
>;
export type CancelFailureReason = CancelCode | TransportFailureReason;
export type CancelResult = { status: 'success'; appointment: Appointment } | ApiFailure<CancelCode>;
export type CancelState = { status: 'idle' } | { status: 'pending'; appointmentId: string } | CancelResult;

// POST /calendar/appointments/{appointmentId}/change, the Administrator or the owner.
type ChangeCode = Extract<
  ApiErrorCode,
  | Common
  | 'invalid_json'
  | 'invalid_request'
  | 'appointment_not_found'
  | 'user_not_found'
  | 'appointment_not_active'
  | 'cancellation_notice_too_short'
  | BookingRule
  | 'concurrent_update'
>;
export type ChangeFailureReason = ChangeCode | TransportFailureReason;
export type ChangeResult = { status: 'success'; cancelled: Appointment; booked: Appointment } | ApiFailure<ChangeCode>;
export type ChangeState = { status: 'idle' } | { status: 'pending'; appointmentId: string; change: ChangeBody } | ChangeResult;

// PATCH /calendar/appointments/{appointmentId}, the Administrator or the owner.
type UpdateNoteCode = Extract<
  ApiErrorCode,
  Common | 'invalid_json' | 'invalid_request' | 'appointment_not_found' | 'appointment_not_active' | 'concurrent_update'
>;
export type UpdateNoteFailureReason = UpdateNoteCode | TransportFailureReason;
export type UpdateNoteResult = { status: 'success'; appointment: Appointment } | ApiFailure<UpdateNoteCode>;
export type UpdateNoteState = { status: 'idle' } | { status: 'pending'; appointmentId: string; note: string | null } | UpdateNoteResult;
