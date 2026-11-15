import type { Role } from './roles';

// The error codes the handlers answer with (docs/ARCHITECTURE.md section 4); API Gateway's own
// 401/403/500 bodies ({ "message": "…" }) are not in this shape.
export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'invalid_json'
  | 'invalid_request'
  | 'user_exists'
  | 'user_not_found'
  | 'cannot_delete_admin'
  | 'internal_error'
  // The shared calendar's codes (docs/SHARED_CALENDAR_SPEC.md section 11.3); the routes that answer
  // each one are listed in docs/ARCHITECTURE.md section 4.
  | 'type_not_found' // 404 (in the path) / 409 (in the body)
  | 'pattern_not_found' // 404
  | 'override_not_found' // 404
  | 'window_not_found' // 404
  | 'appointment_not_found' // 404: unknown, or not the caller's
  | 'type_name_exists' // 409, docs/SHARED_CALENDAR_SPEC.md R-TYPE-01
  | 'type_in_use' // 409, docs/SHARED_CALENDAR_SPEC.md R-TYPE-03
  | 'limit_reached' // 409, a count limit (types, patterns, one-off windows per date)
  | 'date_in_past' // 409, an override or one-off window before today
  | 'availability_overlap' // 409, docs/SHARED_CALENDAR_SPEC.md R-AV-01
  | 'availability_conflict' // 409, docs/SHARED_CALENDAR_SPEC.md R-AV-03; the body carries `conflicts`
  | 'target_not_user' // 409, docs/SHARED_CALENDAR_SPEC.md R-BOOK-01: the target is not a plain User
  | 'booking_in_past' // 409, docs/SHARED_CALENDAR_SPEC.md R-BOOK-03: the start is not in the future
  | 'booking_notice_too_short' // 409, docs/SHARED_CALENDAR_SPEC.md R-BOOK-04: too little notice
  | 'booking_beyond_horizon' // 409, docs/SHARED_CALENDAR_SPEC.md R-BOOK-05: past the horizon
  | 'outside_availability' // 409, docs/SHARED_CALENDAR_SPEC.md R-BOOK-06
  | 'slot_taken' // 409, docs/SHARED_CALENDAR_SPEC.md R-BOOK-07
  | 'appointment_limit_reached' // 409, docs/SHARED_CALENDAR_SPEC.md R-BOOK-09
  | 'appointment_not_active' // 409, docs/SHARED_CALENDAR_SPEC.md R-CAN-02, R-NOTE-01
  | 'cancellation_notice_too_short' // 403, docs/SHARED_CALENDAR_SPEC.md R-CAN-03: too little notice
  | 'concurrent_update'; // 409, the calendar lock was busy three times in a row; the client may retry

// An appointment that an availability write would leave outside the availability
// (docs/SHARED_CALENDAR_SPEC.md R-AV-03).
export type AppointmentConflict = { appointmentId: string; username: string; start: string; end: string };
// `conflicts` is set only with `availability_conflict`.
export type ApiErrorBody = { error: ApiErrorCode; message: string; conflicts?: AppointmentConflict[] };

// 201 of POST /hello.
export type HelloResponse = { messageId: string; role: Role; message: string; createdAt: string };
// 201 of POST /users. The password is shown only in this response.
export type CreateUserResponse = { username: string; password: string };

// One account of GET /users (docs/SHARED_CALENDAR_SPEC.md section 10.1): the members of group
// `user`, never an administrator.
export type UserSummary = { username: string; createdAt: string };
// 200 of GET /users.
export type ListUsersResponse = { users: UserSummary[] };
