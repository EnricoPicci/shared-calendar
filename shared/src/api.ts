import type { Role } from './roles';
import type { UserProfile, UserStatus } from './user';

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
  | 'slot_taken' // 409, docs/SHARED_CALENDAR_SPEC.md R-BOOK-07: no place left in the time asked
  | 'user_busy' // 409, docs/SHARED_CALENDAR_SPEC.md R-BOOK-12: the User already holds an appointment at that time
  | 'appointment_limit_reached' // 409, docs/SHARED_CALENDAR_SPEC.md R-BOOK-09
  | 'appointment_not_active' // 409, docs/SHARED_CALENDAR_SPEC.md R-CAN-02, R-NOTE-01
  | 'cancellation_notice_too_short' // 403, docs/SHARED_CALENDAR_SPEC.md R-CAN-03: too little notice
  | 'concurrent_update' // 409, the calendar lock was busy three times in a row; the client may retry
  // The assistant's codes, with the route that answers each one (docs/CONVERSATIONAL_ARCHITECTURE.md section 6).
  | 'assistant_busy' // 409, a step of the exchange is waiting: the client calls `continue`
  | 'conversation_full' // 409, the conversation holds all the messages it may: a new one must be started
  | 'nothing_to_continue' // 409, `continue` was called while no step was waiting
  | 'proposal_not_found' // 404: unknown, already settled, or dropped
  | 'assistant_limit_reached' // 429, the person has sent their messages for today
  | 'assistant_unavailable' // 503, Claude cannot be reached or asked, for a reason that is not the person's
  | 'assistant_budget_reached' // 503, the spending limit of the Anthropic account is reached
  // The codes of the users' facts and of e-mail, with the routes that answer each one
  // (docs/EMAIL_ARCHITECTURE.md section 9.1).
  | 'cannot_edit_admin' // 403, PUT /users/{username} for another administrator, whose facts are their own; POST /users/{username}/invitation for any administrator
  | 'not_invited' // 409, POST /users/{username}/invitation for an account that has already chosen its password
  | 'no_email_address' // 409, the person asking for a mail has no e-mail address
  | 'mail_limit_reached' // 429, the person has asked for their mails of today
  | 'mail_unavailable'; // 503, e-mail is not switched on in this stack: the mail routes, POST /users and POST /users/{username}/invitation

// An appointment that an availability write would leave outside the availability
// (docs/SHARED_CALENDAR_SPEC.md R-AV-03).
export type AppointmentConflict = { appointmentId: string; username: string; start: string; end: string };
// `conflicts` is set only with `availability_conflict`.
export type ApiErrorBody = { error: ApiErrorCode; message: string; conflicts?: AppointmentConflict[] };

// 201 of POST /hello.
export type HelloResponse = { messageId: string; role: Role; message: string; createdAt: string };
// 201 of POST /users, and 202 of POST /users/{username}/invitation: the account is waiting for its
// first sign-in. No password: Cognito makes the temporary one and e-mails it to the User
// (docs/EMAIL_ARCHITECTURE.md section 5.1), so the API never sees it.
export type CreateUserResponse = { username: string; status: 'invited' };

// One account of GET /users (docs/SHARED_CALENDAR_SPEC.md section 10.1): the members of group
// `user`, never an administrator, with their four facts and the state of their account
// (docs/EMAIL_ARCHITECTURE.md section 9.1). Also the answer of PUT /users/{username}.
export type UserSummary = { username: string; createdAt: string; status: UserStatus } & UserProfile;
// 200 of GET /users.
export type ListUsersResponse = { users: UserSummary[] };
