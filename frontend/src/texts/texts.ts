import type { DateFormats, Role } from '@shared-calendar/shared';

// The type of every text of the page (docs/MULTILANGUAGE_ARCHITECTURE.md section 5.1, decision
// L8): one object per language has this type, so that a language with a text missing does not
// compile. A fixed text is a string; a text that carries a value is a function of that value, so
// that each language builds its own sentence, with its own word order and its own singular and
// plural.
//
// `html` holds the fixed texts of index.html, which holds keys instead of words
// (docs/MULTILANGUAGE_ARCHITECTURE.md decision L11): an element carries `data-text="frame.signOut"`
// for its text, or `data-label="…"` for its name read by a screen reader, and the key is the path
// under `html`. Only a string can be a key's text. The other groups hold the texts the logic layer
// puts together with data.

// The reasons of a failure that have a sentence of their own: the API's error codes and the
// services' own reasons (docs/FRONTEND_SERVICES.md section 10.2). Any other reason gets the general
// sentence.
export const FAILURE_REASONS = [
  'network',
  'server',
  'unexpected',
  'not_signed_in',
  'session_rejected',
  'forbidden',
  'invalid_request',
  'internal_error',
  'invalid_json',
  'slot_taken',
  'user_busy',
  'booking_in_past',
  'booking_notice_too_short',
  'booking_beyond_horizon',
  'outside_availability',
  'appointment_limit_reached',
  'user_not_found',
  'target_not_user',
  'concurrent_update',
  'appointment_not_found',
  'appointment_not_active',
  'cancellation_notice_too_short',
  'user_exists',
  'cannot_delete_admin',
  'cannot_edit_admin',
  'not_invited',
  'no_email_address',
  'mail_limit_reached',
  'mail_unavailable',
  'type_name_exists',
  'type_in_use',
  'type_not_found',
  'pattern_not_found',
  'availability_overlap',
  'availability_conflict',
  'limit_reached',
  'date_in_past',
  'override_not_found',
  'window_not_found',
  'assistant_busy',
  'proposal_not_found',
  'nothing_to_continue',
  'invalid_credentials',
  'too_many_attempts',
  'password_reset_required',
  'challenge',
  'no_role',
  'session_expired',
  'password_refused',
  'wrong_current_password',
] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

// What went wrong, in words for the person in front of the screen: by reason, and where the same
// reason needs other words, by what was being attempted or by who attempted it.
export type FailureTexts = {
  // A reason without a sentence of its own.
  general: string;
  reasons: Record<FailureReason, string>;
  // A change refused with the reasons of a cancellation or of a booking.
  change: { cancellation_notice_too_short: string; appointment_limit_reached: string };
  // The limit met while creating a type, a weekly pattern or an extra window, with the number the
  // calendar holds.
  typeLimit: (types: number) => string;
  patternLimit: (patterns: number) => string;
  windowLimit: (windows: number) => string;
  // Going back to the weekly patterns, refused for an overlap with an extra window.
  patternsBackOverlap: string;
  // A message to the assistant refused before the request, with the longest a message may be.
  messageRefused: (length: number) => string;
  // A mail of the calendar refused before the request, with the most days it may cover.
  mailRefused: (days: number) => string;
  // `user_busy` for the Administrator, who booked for a User.
  userBusyForAdmin: string;
};

// The frame: the header, the navigation, the role in words.
export type FrameTexts = {
  roles: Record<Role, string>;
  nav: { week: string; appointments: string; settings: string; users: string; availability: string; me: string; password: string };
};

// The password's words, which the password screen and "Choose your password" share: what a new
// password still misses, by the problems of the shared rule (shared/src/password.ts) and being the
// current password again, with the rule's own numbers and symbols; the hints of the other fields;
// and what the login says after a change.
export type PasswordTexts = {
  problems: {
    too_short: (minimum: number) => string;
    too_long: (maximum: number) => string;
    no_uppercase: string;
    no_lowercase: string;
    no_digit: string;
    no_symbol: (symbols: string) => string;
    blank: string;
    same_as_current: string;
  };
  currentEmpty: string;
  againEmpty: string;
  differ: string;
  changed: string;
};

// The week's words that come with data (docs/SHARED_CALENDAR_SPEC.md section 16.8): what a slot
// says beside its time and on its narrow tab, the Administrator's block of many appointments, the
// list of Users to book for, and a refused booking or change.
export type WeekTexts = {
  full: string;
  free: string;
  placesLeft: (left: number, capacity: number) => string;
  // The narrow tab of a slot that appointments overlap.
  tabLeft: (left: number) => string;
  people: (count: number) => string;
  loadingUsers: string;
  noUsers: string;
  // A full time, for the Administrator, who may book over the capacity.
  fullForAdmin: string;
  // `user_busy` with the appointment in the way, `what` being its time and its type.
  busyFor: (username: string, what: string) => string;
  busyYou: (what: string) => string;
};

// An appointment as the detail dialog and the lists say it: who for, who booked it and when, and
// the one sentence about what can still be done to it.
export type AppointmentTexts = {
  // The User, for a User reading about their own appointment.
  you: string;
  // The note when there is none.
  noNote: string;
  bookedBy: (by: string, when: string) => string;
  // Who booked it, when the reader did.
  byYou: string;
  moved: string;
  cancelled: string;
  ended: string;
  until: (when: string) => string;
  tooLate: string;
};

// The week's "E-mail…" dialog: what the mail holds, by role, and where it goes, the address
// already masked.
export type MailTexts = {
  what: Record<Role, string>;
  sentTo: (maskedAddress: string) => string;
  sentNoAddress: string;
};

// The keys of index.html, by the part of the page they belong to.
export type HtmlTexts = {
  // Words several parts of the page use.
  common: { cancel: string; close: string; note: string; change: string; loading: string; from: string; to: string };
  frame: {
    // The page's name: the browser's tab, the header and the sign-in screen.
    title: string;
    signOut: string;
    // The navigation's name for a screen reader.
    screens: string;
  };
  login: { username: string; password: string; signIn: string };
  // "Choose your password": its sentence is two texts around the username.
  choose: { heading: string; aboutBefore: string; aboutAfter: string; submit: string };
  password: { heading: string; current: string; newPassword: string; newPasswordAgain: string; about: string; submit: string };
  // The week: its toolbar, the banner of a move (a sentence around the appointment moved), the
  // line of the time zone (a sentence around the zone's name), a User's busy time.
  week: {
    previous: string;
    today: string;
    next: string;
    mailOpen: string;
    movingBefore: string;
    movingAfter: string;
    keep: string;
    zoneBefore: string;
    zoneAfter: string;
    busy: string;
  };
  // The book dialog, which also confirms the move of an appointment.
  book: {
    titleBooking: string;
    titleChange: string;
    from: string;
    to: string;
    forUser: string;
    start: string;
    end: string;
    hour: string;
    minute: string;
    anywayBooking: string;
    anywayChange: string;
    forceBooking: string;
    forceChange: string;
    submit: string;
  };
  mail: { title: string; send: string };
  detail: { title: string; when: string; type: string; forUser: string; saveNote: string; cancelAppointment: string };
};

export type PageTexts = {
  html: HtmlTexts;
  frame: FrameTexts;
  failures: FailureTexts;
  password: PasswordTexts;
  week: WeekTexts;
  appointment: AppointmentTexts;
  mail: MailTexts;
  // The ways a date is written, from shared/ (docs/MULTILANGUAGE_ARCHITECTURE.md decision L10).
  dates: DateFormats;
};

// The type of the length budgets (docs/MULTILANGUAGE_ARCHITECTURE.md section 6.3, rule 2): the
// shape of the texts, partial, with the highest number of characters where a text stands in a
// tight place. A function text is budgeted on the sample values its test gives it. The budget
// binds every real language, not the padded test language, whose job is to find the places.
export type Budgets<T> = { [K in keyof T]?: T[K] extends string | ((...args: never[]) => string) ? number : Budgets<T[K]> };

// The tight places: the header and the links of the navigation, which share one row; the buttons
// of the week's toolbar and of the dialogs, side by side; a slot's narrow tab.
export const PAGE_TEXT_BUDGETS: Budgets<PageTexts> = {
  html: {
    frame: { title: 24, signOut: 12 },
    common: { cancel: 16, close: 12, change: 14 },
    login: { signIn: 20 },
    choose: { submit: 24 },
    password: { submit: 24 },
    week: { today: 12, mailOpen: 14 },
  },
  // A slot's narrow tab beside the appointments that overlap it.
  week: { full: 8, tabLeft: 8 },
  frame: {
    roles: { admin: 14, user: 14 },
    nav: { week: 16, appointments: 18, settings: 16, users: 16, availability: 16, me: 16, password: 16 },
  },
};
