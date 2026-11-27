import { dateFormats } from '@shared-calendar/shared';
import type { PageTexts } from './texts';

const GENERAL = 'Something went wrong. Please try again.';

// The texts of the page in English. The failures' sentences say what the person can do next; the
// notes beside them say why a sentence reads as it does.
export const PAGE_TEXTS_EN: PageTexts = {
  locale: 'en',
  html: {
    common: {
      cancel: 'Cancel',
      close: 'Close',
      note: 'Note',
      change: 'Change',
      loading: 'Loading…',
      from: 'From',
      to: 'To',
      edit: 'Edit',
      save: 'Save',
      delete: 'Delete',
      back: 'Back',
      confirm: 'Confirm',
      retry: 'Try again',
    },
    frame: { title: 'Shared calendar', signOut: 'Sign out', screens: 'Screens' },
    login: { username: 'Username', password: 'Password', signIn: 'Sign in', language: 'Language' },
    choose: {
      heading: 'Choose your password',
      aboutBefore: 'You signed in as',
      aboutAfter: 'with a temporary password. Choose your own password to go on.',
      submit: 'Choose password',
    },
    password: {
      heading: 'Password',
      current: 'Current password',
      newPassword: 'New password',
      newPasswordAgain: 'New password again',
      about: 'After the change you are signed out, here and on every other device, and sign in again with the new password.',
      submit: 'Change password',
    },
    week: {
      previous: 'Previous week',
      today: 'Today',
      next: 'Next week',
      mailOpen: 'E-mail…',
      movingBefore: 'Moving:',
      movingAfter: '. Choose a free time.',
      keep: 'Keep the appointment as it is',
      zoneBefore: "Times are in the calendar's time zone,",
      zoneAfter: '.',
      busy: 'busy',
    },
    book: {
      titleBooking: 'Book an appointment',
      titleChange: 'Change appointment',
      from: 'From:',
      to: 'To:',
      forUser: 'For',
      start: 'Start',
      end: 'End',
      hour: 'Hour',
      minute: 'Minute',
      anywayBooking: 'Book anyway, over the capacity?',
      anywayChange: 'Change anyway, over the capacity?',
      forceBooking: 'Book anyway',
      forceChange: 'Change anyway',
      submit: 'Book',
    },
    mail: { title: 'E-mail the appointments', send: 'Send' },
    appointments: { upcoming: 'Upcoming', history: 'History', show: 'Show' },
    profile: { givenName: 'First name', familyName: 'Last name', email: 'E-mail', address: 'Postal address' },
    users: {
      heading: 'Users',
      create: 'Create user',
      retryLabel: 'Try again to read the users',
      resend: 'Resend invitation',
      inviteTitle: 'Send an invitation',
      deleteUser: 'Delete user',
      keep: 'Keep',
    },
    me: {
      heading: 'My details',
      retryLabel: 'Try again to read your details',
      role: 'Role',
      about: 'To change your details, ask the Administrator.',
      editTitle: 'Edit my details',
    },
    settings: {
      heading: 'Settings',
      retryLabel: 'Try again to read the settings',
      cancellationNotice: 'Cancellation notice',
      minBookingNotice: 'Minimum booking notice',
      bookingHorizon: 'Booking horizon',
      maxUpcoming: 'Maximum upcoming appointments per person',
      noLimit: 'No limit',
      zoneBefore: 'Time zone:',
      zoneAfter: '. It is set when the calendar is installed and cannot be changed here.',
      saved: 'Settings saved.',
    },
    daily: {
      heading: 'Daily e-mail',
      retryLabel: "Try again to read the daily e-mail's settings",
      enabled: 'Send the daily e-mail',
      hour: 'Hour',
      about: 'Two Excel files: the appointments booked for the next 7 days, and a backup of every appointment from the first day of last month.',
      saved: 'Daily e-mail saved.',
      submit: 'Save daily e-mail',
    },
    availability: {
      heading: 'Availability',
      types: 'Types',
      patterns: 'Weekly patterns',
      singleDate: 'A single date',
      name: 'Name',
      capacity: 'Capacity',
      weekday: 'Weekday',
      validFrom: 'Valid from',
      validUntil: 'Valid until',
      date: 'Date',
      noEnd: 'Leave empty for no end.',
      createType: 'Create type',
      createPattern: 'Create pattern',
      retryTypes: 'Try again to read the types',
      retryPatterns: 'Try again to read the weekly patterns',
      retryDate: 'Try again to read this date',
      asPatterns: 'As the weekly patterns give it',
      asNow: 'As it is now',
      editDay: 'This day only…',
      makeClosed: 'Not available on this day',
      backToPatterns: 'Back to the weekly patterns',
      thisDayOnly: 'This day only',
      add: 'Add',
      discard: 'Discard',
      saveDay: 'Save this day',
      extraWindows: 'Extra windows',
      addWindow: 'Add window',
      ended: 'ended',
      remove: 'Remove',
      editType: 'Edit type',
      changePattern: 'Change pattern',
      confirmTitle: 'Please confirm',
    },
    assistant: {
      toggle: 'Assistant',
      end: 'New conversation',
      processed: "This conversation is processed by Anthropic's Claude.",
      message: 'Message',
      send: 'Send',
    },
    detail: { title: 'Appointment', when: 'When', type: 'Type', forUser: 'For', saveNote: 'Save note', cancelAppointment: 'Cancel appointment' },
  },
  frame: {
    roles: { admin: 'Administrator', user: 'User' },
    nav: { week: 'Week', appointments: 'My appointments', settings: 'Settings', users: 'Users', availability: 'Availability', me: 'My details', password: 'Password' },
  },
  failures: {
    general: GENERAL,
    reasons: {
      // Every API call (the transport reasons of docs/FRONTEND_SERVICES.md section 10.2), and the
      // login where it has the same reason.
      network: 'The server cannot be reached. Check the connection and try again.',
      server: 'The server is not answering as it should. Please try again in a moment.',
      unexpected: GENERAL,
      not_signed_in: 'You are not signed in. Please sign in again.',
      session_rejected: 'Your session has ended. Please sign in again.',
      // GET /calendar (docs/FRONTEND_SERVICES.md section 18.1).
      forbidden: 'Your account is not allowed to do this.',
      invalid_request: 'The request was not accepted. Check what you entered and try again.',
      internal_error: 'Something went wrong on the server. Please try again in a moment.',
      // Booking, cancelling, changing and the note (docs/FRONTEND_SERVICES.md section 19.1) and the
      // list of users (docs/FRONTEND_SERVICES.md section 13.1). After a refused booking or change
      // the week is loaded again (docs/FRONTEND_ARCHITECTURE.md section 5.1), which is what the
      // sentence of `slot_taken` says: a time is full when its places are taken, one place or more
      // (docs/SHARED_CALENDAR_SPEC.md R-BOOK-07). `user_busy` is a person's own appointment in the
      // way (docs/SHARED_CALENDAR_SPEC.md R-BOOK-12); a change leaves the old appointment out of
      // that check (docs/SHARED_CALENDAR_SPEC.md R-CHG-01), which is why the sentence points to
      // changing it.
      invalid_json: 'The server could not read the request. Please try again.',
      slot_taken: 'This time is full: there is no place left. The calendar has been refreshed: please choose another time.',
      user_busy: 'You already have an appointment at this time. To move it, change that appointment instead.',
      booking_in_past: 'This time has already passed. Please choose a later one.',
      booking_notice_too_short: 'This time is too soon to be booked. Please choose a later one.',
      booking_beyond_horizon: 'This time is too far ahead to be booked yet. Please choose an earlier one.',
      outside_availability: 'This time is not within the hours open for booking. Please choose another time.',
      appointment_limit_reached: 'You have as many upcoming appointments as the calendar allows. Cancel one to book another.',
      user_not_found: 'This user no longer exists.',
      target_not_user: 'An appointment can be booked for a User only, not for an Administrator.',
      concurrent_update: 'The calendar was being changed at the same moment. Please try again.',
      appointment_not_found: 'This appointment cannot be found.',
      appointment_not_active: 'This appointment has already been cancelled, or it has ended.',
      cancellation_notice_too_short: 'It is too late to cancel this appointment.',
      // Creating and deleting a user (docs/FRONTEND_SERVICES.md section 13.1).
      user_exists: 'A user with this username exists already. Choose another username.',
      cannot_delete_admin: 'An Administrator cannot be deleted.',
      // A person's facts and e-mail (docs/EMAIL_ARCHITECTURE.md section 9.1). `mail_unavailable` is
      // the answer of a stack where e-mail is not switched on yet (docs/EMAIL_PLAN.md finding F13).
      cannot_edit_admin: "Another Administrator's details cannot be changed.",
      not_invited: 'This user has already chosen a password: there is no invitation to send again.',
      no_email_address: 'There is no e-mail address in your details. Ask the Administrator to add one.',
      mail_limit_reached: 'You have asked for as many e-mails as a day allows. Please try again tomorrow.',
      mail_unavailable: 'E-mail is not available yet.',
      // The availability types and the weekly patterns (docs/FRONTEND_SERVICES.md sections 16.1
      // and 17.1). A type is in use as docs/SHARED_CALENDAR_SPEC.md R-TYPE-03 says; two windows of
      // one date may not overlap whatever their types (docs/SHARED_CALENDAR_SPEC.md R-AV-01); and
      // the appointments a change of availability would leave outside it are listed under the
      // sentence of `availability_conflict` (docs/SHARED_CALENDAR_SPEC.md R-AV-03).
      type_name_exists: 'A type with this name exists already. Choose another name.',
      type_in_use: 'This type is in use, so it cannot be deleted. A type is in use while a weekly pattern, a date of today or later or an upcoming appointment uses it.',
      type_not_found: 'This type no longer exists.',
      pattern_not_found: 'This pattern no longer exists.',
      availability_overlap: 'Another window of the same day covers part of these hours, whatever its type. Choose other hours.',
      availability_conflict: 'This would leave booked appointments outside the hours open for booking. Cancel or move them in the week first.',
      limit_reached: 'The calendar cannot hold more of these. Delete one to create another.',
      // A single date: its own windows and its extra windows (docs/FRONTEND_SERVICES.md section
      // 17.1). A date before today, the calendar's today, cannot be changed
      // (docs/SHARED_CALENDAR_SPEC.md R-AV-02): the server says so for a page left open over
      // midnight.
      date_in_past: 'This date is now in the past, so it can no longer be changed.',
      override_not_found: 'This day no longer has windows of its own: the weekly patterns apply.',
      window_not_found: 'This extra window no longer exists.',
      // The assistant (docs/FRONTEND_SERVICES.md section 21.1): the three answers after which the
      // panel reads the conversation again, so that it shows what the server holds; each sentence
      // says so. The three reasons for which the assistant cannot answer and a full conversation
      // have their sentences in shared/, in the conversation's language.
      assistant_busy: 'The assistant was still at work on this conversation. The conversation has been read again: please look at it before going on.',
      proposal_not_found: 'This proposal was no longer waiting for an answer. The conversation has been read again.',
      nothing_to_continue: 'The assistant had nothing left to do. The conversation has been read again.',
      // The login (docs/FRONTEND_SERVICES.md section 4.3). A wrong password and an unknown user are
      // one reason, so that the sentence does not say which usernames exist.
      invalid_credentials: 'The username or the password is not correct.',
      too_many_attempts: 'Too many attempts. Please wait a few minutes and try again.',
      password_reset_required: 'Your password must be reset before you can sign in. Please ask the Administrator.',
      challenge: 'This account needs a sign-in step that this page does not offer. Please ask the Administrator.',
      no_role: 'Your account has no role yet, so it cannot use the calendar. Please ask the Administrator.',
      // The first sign-in with a temporary password (docs/FRONTEND_SERVICES.md section 4.9):
      // Cognito's 3 minutes for the new password are over, or Cognito did not take the new password.
      session_expired: 'This took too long. Please sign in again.',
      password_refused: 'This password was not accepted. Please choose another one.',
      // The change of one's own password (docs/FRONTEND_SERVICES.md section 22.3). Its other reasons
      // have the sentences above: `too_many_attempts` is the login's, since a wrong current password
      // counts towards the same lockout at Cognito.
      wrong_current_password: 'The current password is not correct.',
    },
    // A change is refused with the cancellation's reason when its appointment is too close to be
    // moved by a User (docs/SHARED_CALENDAR_SPEC.md section 8.4): nothing was being cancelled. And
    // a change that meets the limit of upcoming appointments books nothing more: the limit was
    // lowered below what the User already holds (docs/SHARED_CALENDAR_SPEC.md R-SET-03), and the
    // way out is to cancel one, not to give up a booking.
    change: {
      cancellation_notice_too_short: 'It is too late to change this appointment.',
      appointment_limit_reached: 'You have more upcoming appointments than the calendar now allows, so this one cannot be moved. Cancel one first.',
    },
    // The limit met says how many the calendar holds, which depends on what was being created: an
    // availability type (docs/SHARED_CALENDAR_SPEC.md R-TYPE-01), a weekly pattern
    // (docs/SHARED_CALENDAR_SPEC.md R-PAT-04) or an extra window of a date
    // (docs/SHARED_CALENDAR_SPEC.md R-ONE-03).
    typeLimit: (types) => `The calendar can hold ${types} types at most. Delete one to create another.`,
    patternLimit: (patterns) => `The calendar can hold ${patterns} weekly patterns at most. Delete one to create another.`,
    windowLimit: (windows) => `A day can hold ${windows} extra windows at most. Delete one to add another.`,
    // Going back to the weekly patterns chooses no hours: the overlap is between the patterns'
    // hours, which would apply again, and an extra window of the day
    // (docs/SHARED_CALENDAR_SPEC.md section 6.5, the last row of its table).
    patternsBackOverlap: 'The hours the weekly patterns give this day overlap one of its extra windows. Delete that extra window first.',
    // The one thing that can be wrong with a message refused before the request is its length
    // (docs/CONVERSATIONAL_ARCHITECTURE.md section 4.4).
    messageRefused: (length) => `A message can be ${length} characters long at most, and cannot be empty.`,
    // The two dates are what can be wrong with a mail refused before the request
    // (docs/EMAIL_ARCHITECTURE.md section 6.5).
    mailRefused: (days) => `Choose two dates, the first not after the second, at most ${days} days in all.`,
    // `user_busy` is about the User the Administrator booked for, not about the Administrator
    // (docs/SHARED_CALENDAR_SPEC.md R-BOOK-12).
    userBusyForAdmin: 'This User already has an appointment at this time.',
  },
  password: {
    problems: {
      too_short: (minimum) => `At least ${minimum} characters.`,
      too_long: (maximum) => `At most ${maximum} characters.`,
      no_uppercase: 'An upper-case letter, A to Z.',
      no_lowercase: 'A lower-case letter, a to z.',
      no_digit: 'A digit, 0 to 9.',
      no_symbol: (symbols) => `One of these symbols: ${symbols}`,
      blank: 'No space, and no other blank character.',
      same_as_current: 'Not the same as the current password.',
    },
    currentEmpty: 'Type the password you use now.',
    againEmpty: 'Type the new password once more.',
    differ: 'The two new passwords are not the same.',
    changed: 'Password changed.',
  },
  week: {
    full: 'Full',
    free: 'free',
    placesLeft: (left, capacity) => `${left} of ${capacity} places left`,
    tabLeft: (left) => `${left} left`,
    people: (count) => `${count} people`,
    loadingUsers: 'Loading the users…',
    noUsers: 'There is no User to book for.',
    fullForAdmin: 'This time is full: there is no place left.',
    busyFor: (username, what) => `${username} already has an appointment at this time (${what}).`,
    busyYou: (what) => `You already have an appointment at this time (${what}); open it to change it.`,
  },
  appointment: {
    you: 'You',
    noNote: '—',
    bookedBy: (by, when) => `Booked by ${by} on ${when}`,
    byYou: 'you',
    moved: 'This appointment was moved to another time.',
    cancelled: 'This appointment was cancelled.',
    ended: 'This appointment has ended.',
    until: (when) => `It can be changed or cancelled until ${when}.`,
    tooLate: 'It is too late to change or cancel this appointment.',
  },
  mail: {
    what: {
      admin: 'The whole calendar between the two dates, as an Excel file, to your own e-mail address.',
      user: 'Your appointments between the two dates, as an Excel file, to your own e-mail address.',
    },
    sentTo: (maskedAddress) => `On its way to ${maskedAddress}`,
    sentNoAddress: 'On its way to your e-mail address',
  },
  list: {
    status: { booked: 'Booked', ended: 'Ended', cancelled: 'Cancelled', changed: 'Changed' },
    emptyUpcoming: 'You have no upcoming appointments.',
    emptyHistory: 'There are no appointments in this period.',
    bothDates: 'Choose both dates.',
    firstAfterLast: 'The first date is after the last one.',
    periodTooLong: (days) => `A period can be at most ${days} days long. Choose a shorter one.`,
  },
  // The rules' words are held to the shared schemas by the test of src/logic/profile.model.ts.
  profile: {
    givenName: (longest) => `A first name has 1 to ${longest} characters, on one line.`,
    familyName: (longest) => `A last name has 1 to ${longest} characters, on one line.`,
    email: (longest) => `An e-mail address, such as anna.rossi@example.com, of at most ${longest} characters.`,
    address: (longest) => `A postal address has 1 to ${longest} characters, on one or more lines.`,
    notSet: 'Not set',
  },
  users: {
    status: { invited: 'invited', active: 'active' },
    edit: (username) => `Edit ${username}`,
    resend: (username) => `Resend the invitation to ${username}`,
    remove: (username) => `Delete ${username}`,
    inviteQuestion: (email) => `An invitation will be sent to ${email}.`,
    invitedAnswer: (email) => `An invitation was sent to ${email}.`,
    // The route deletes an account it made but could not finish, so nothing is kept and the same
    // username can be tried again (docs/EMAIL_ARCHITECTURE.md section 5.1).
    createFailed: 'The user could not be created, and nothing was kept. Please try again in a moment.',
    noUsers: 'There are no users yet.',
    // What a username is (docs/ARCHITECTURE.md section 4): the hint under the field and the
    // refusal of a text that is not one; the test of src/logic/users.model.ts holds it to the
    // shared schema.
    usernameHint: 'A username has 3 to 32 characters: lowercase letters, digits, ".", "_" and "-", starting with a letter or a digit.',
    // Whom, what happens to their appointments (docs/SHARED_CALENDAR_SPEC.md section 10.2), and
    // that there is no way back.
    deleteQuestion: (username) => `Delete ${username}? Their future appointments will be cancelled. This cannot be undone.`,
  },
  // A refusal names its field in the words of the field's label.
  settings: {
    defaults: 'These are the default settings: nobody has saved them yet.',
    lastSaved: (username, when) => `Last saved by ${username} on ${when}`,
    ranges: {
      cancellationNoticeHours: (min, max) => `hours, from ${min} to ${max}`,
      minBookingNoticeHours: (min, max) => `hours, from ${min} to ${max}`,
      bookingHorizonDays: (min, max) => `days, from ${min} to ${max}`,
      maxFutureAppointmentsPerUser: (min, max) => `appointments, from ${min} to ${max}`,
    },
    refusals: {
      cancellationNoticeHours: (min, max) => `Cancellation notice must be a whole number from ${min} to ${max}.`,
      minBookingNoticeHours: (min, max) => `Minimum booking notice must be a whole number from ${min} to ${max}.`,
      bookingHorizonDays: (min, max) => `Booking horizon must be a whole number from ${min} to ${max}.`,
      maxFutureAppointmentsPerUser: (min, max) => `Maximum upcoming appointments per person must be a whole number from ${min} to ${max}.`,
    },
    // The hour is the calendar's (docs/EMAIL_ARCHITECTURE.md section 6.2).
    daily: {
      range: "A whole hour, from 00:00 to 23:00, in the calendar's time zone.",
      rangeIn: (timeZone) => `A whole hour, from 00:00 to 23:00, in the calendar's time zone, ${timeZone}.`,
      refusal: 'The hour must be a whole hour from 00:00 to 23:00, such as 07:00.',
    },
  },
  availability: {
    places: (capacity) => `${capacity} places`,
    editLabel: (what) => `Edit ${what}`,
    changeLabel: (what) => `Change ${what}`,
    deleteLabel: (what) => `Delete ${what}`,
    noTypes: 'There are no types yet.',
    typeNameHint: (longest) => `A name has 1 to ${longest} characters, with no tab in it.`,
    typeCapacityHint: (min, max) => `How many people at the same time: a whole number from ${min} to ${max}.`,
    deleteType: (name) => `Delete the type ${name}? This cannot be undone.`,
    noTypeYet: 'Create a type first: a pattern needs one.',
    endNotLater: 'End must be later than Start.',
    endNotWholeHours: 'End must be a whole number of hours after Start.',
    typeNotChosen: 'Type must be chosen.',
    validFromNotDate: 'Valid from must be a date.',
    validUntilNotDate: 'Valid until must be a date, or left empty.',
    validUntilBefore: 'Valid until must not be before Valid from.',
    noPatterns: 'There are no weekly patterns yet.',
    unknownType: 'Unknown type',
    validFrom: (date) => `from ${date}`,
    validFromTo: (from, to) => `from ${from} to ${to}`,
    deletePattern: (what, validity) => `Delete the pattern ${what}, ${validity}? Its hours will no longer be open for booking. This cannot be undone.`,
    inTheWay: (count) => (count === 1 ? '1 appointment is in the way:' : `${count} appointments are in the way:`),
  },
  date: {
    dateNeeded: 'Choose a date.',
    pastDate: 'A date before today cannot be changed. The week shows what a past day had.',
    zonePending: 'The calendar is still being read. Try again in a moment.',
    draftOpen: 'Save or discard the changes to this day first.',
    noPatternHours: 'The weekly patterns give no hours on this day.',
    patternsNotKnown: 'The weekly patterns could not be read.',
    patternsApply: 'The weekly patterns apply on this day.',
    ownWindows: 'This day has its own windows, in the place of the weekly patterns.',
    notAvailable: 'This day is not available: the weekly patterns do not apply.',
    noExtras: 'This day has no extra windows.',
    deleteExtraLabel: (time, typeName) => `Delete the extra window ${time} ${typeName}`,
    deleteExtraQuestion: (time, typeName, date) =>
      `Delete the extra window ${time} ${typeName} of ${date}? Its hours will no longer be open for booking. This cannot be undone.`,
    closeQuestion: (date) => `Make ${date} not available? No hours of the weekly patterns, and none of its own, will be open for booking on this day. Its extra windows stay.`,
    reopenQuestion: (date) => `Back to the weekly patterns for ${date}? What was set for this day only will be removed. Its extra windows stay.`,
    draftEmpty: 'No window is left: saved like this, the day is not available.',
    removeLabel: (time, typeName) => `Remove ${time} ${typeName}`,
    overlapsDraft: 'Start and End overlap another window of this day. Choose other hours.',
    draftFull: (windows) => `A day can have ${windows} windows of its own at most. Remove one to add another.`,
  },
  assistant: {
    who: { person: 'You', assistant: 'Assistant', notice: 'Notice' },
    done: 'Done',
    notDone: (why) => `Not done. ${why}`,
    unknown: 'It is not known whether this was done. Please check the calendar.',
    remaining: (left) => (left <= 0 ? 'No messages left today' : left === 1 ? '1 message left today' : `${left} messages left today`),
    couldNotFinish: 'The assistant could not finish. Please ask again, in other words.',
  },
  dates: dateFormats('en'),
};
