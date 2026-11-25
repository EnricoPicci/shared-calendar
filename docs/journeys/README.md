# The journeys, explained

This folder explains the integration journeys in simple words, one page per `describe` block (or
per test file when the file has no `describe`). Each page tells the block's story: who takes part,
what is in place before it starts, what happens step by step, what the test checks at each step, and
what is left behind.

How to write, check and refresh a page, step by step, is the project skill
`.claude/skills/explain-journey/SKILL.md`; this page keeps the format and the rules it follows.

**The reader** is a developer new to the project: someone who reads TypeScript and tests but does
not know the calendar specification yet. The pages name the code (services, routes, helpers,
fields, error codes) and explain the calendar ideas the story needs.

**These pages are not a source of truth.** They explain the tests. The behaviour is defined by
`docs/ARCHITECTURE.md` and `docs/SHARED_CALENDAR_SPEC.md`, the services by
`docs/FRONTEND_SERVICES.md`, and the tests themselves are what runs. On any conflict, those win, and
the page is fixed.

## Layout

| Path | What it holds |
|---|---|
| `README.md` | this page: the format, the rules and the list of pages |
| `PLAN.md` | the plan of the pages still to write: phases, batches, sessions, acceptance check |
| `concepts.md` | the ideas several journeys use, the calendar's and the assistant's, explained once; every page links to the sections it needs |
| `backend/` | one page per journey of `backend/tests/integration/` |
| `frontend/` | one page per journey of `frontend/tests/integration/` |

File names are lower case with hyphens: `<test file>-<describe block>.md`, shortened where the
test file name adds nothing (`frontend/calendar-view.md` for the block `calendar view` of
`frontend/tests/integration/calendar.test.ts`).

## The format of a page

1. **Title**: "The «block» journey, in simple words".
2. **A header table**: the test file, the `describe` block, its tests (`it` names, numbered, in
   order) and the stack it runs against. The numbers are the tests' names on the page: the story's
   headings are "Test N: …" (with the scenario, if the test names one: "Test 2 (AC-10): …"), and
   one test refers to another as "test N".
   Under the table, one line "Ideas used here, explained once for all journeys:" links to the
   sections of `concepts.md` the page relies on.
3. **What this block proves**: two to four lines naming the rules and scenarios it covers, each with
   its document (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-02, AC-12).
4. **Who takes part**: the actors and what each one is for.
5. **Before the block starts**: the state the file's and the block's `beforeAll` set up.
6. **The story**: one subsection per test, in order, in one of two forms.
   - **The short form**, for a test that makes one call and checks its answer (whether a request
     leaves or the service refuses it first): one paragraph saying the call, what the test checks,
     and the rule behind it.
   - **The full form**, for a test that tells a story: numbered steps, a small table of the state
     where it helps (for example the slots of a day), and a Mermaid sequence diagram when three or
     more actors take part.

   Each "the test checks" bullet matches an `expect` in the test. The checks on the API's answers
   come first. The checks on stored items, which a test reads directly in a table, follow in their
   own group, "In the table, the test checks that:" (in the short form, one sentence starting "In
   the table, …"). Something the server does that no `expect` checks may be told too, but as the
   server's behaviour, never as a check.
7. **What the block leaves**: what is in the local tables and in Cognito when the block ends, for
   the blocks after it and for the next run. A table where several items are left (for example the
   appointments of a day, with who booked them); one sentence when nothing is.
8. **If the block fails halfway**: what the `afterAll` and the next run's `beforeAll` clean up, and
   what stays in the local tables as history.
9. **Where in the code**: the services or routes called, the helpers, the file's constants. By name,
   never by line number.
10. **Background** (optional), each section headed "Background: …": only what belongs to this block
    alone. Anything another journey could use goes into `concepts.md`. A block that covers a
    numbered set of rules may end with "Background: which test proves which rule", a table of the
    rules in the order the server checks them, with the error and the test of each.

## Writing rules

- Simple words, short sentences, the present tense. Explain an idea the first time it appears, or
  link to `concepts.md`.
- A reference names the document by its path, as in code comments (`CLAUDE.md`, "Comments"):
  `docs/SHARED_CALENDAR_SPEC.md` section 6.5, never "spec 6.5". No history: no versions, briefs or
  "since step N".
- Every claim is checked against the test and the code it calls before the page is written.
  When the test and the specification disagree, the page says so and the disagreement is reported.
- **The pointer comment.** The `describe` the page explains carries a one-line comment above it:
  `// Explained in simple words in docs/journeys/frontend/calendar-view.md.` When the `describe`
  has a "Test names:" comment, the pointer goes above it, so that comment stays directly above the
  `describe`. A page that explains a whole file without a `describe` puts the same line directly
  above the file's opening comment (the first comment after the imports). Whoever changes the
  test sees the page in the same diff. The lint rule `local/doc-references` checks that the page
  exists (`scripts/doc-references.mjs`).
- When a test changes, its page changes in the same commit.

## The pages

The pages written so far. Which pages are still to come, and in which order, is in
[`PLAN.md`](PLAN.md).

### Front end

| Page | Explains |
|---|---|
| [`frontend/calendar-view.md`](frontend/calendar-view.md) | `frontend/tests/integration/calendar.test.ts`, `calendar view` |
| [`frontend/calendar-appointments.md`](frontend/calendar-appointments.md) | `frontend/tests/integration/calendar.test.ts`, `appointments` |
| [`frontend/assistant-reading.md`](frontend/assistant-reading.md) | `frontend/tests/integration/assistant.test.ts`, `a reading driven by continue` |
| [`frontend/assistant-booking.md`](frontend/assistant-booking.md) | `frontend/tests/integration/assistant.test.ts`, `a booking confirmed` |
| [`frontend/assistant-declined.md`](frontend/assistant-declined.md) | `frontend/tests/integration/assistant.test.ts`, `a proposal declined` |
| [`frontend/logout.md`](frontend/logout.md) | `frontend/tests/integration/logout.service.test.ts`, `logout` |
| [`frontend/change-password.md`](frontend/change-password.md) | `frontend/tests/integration/change-password.test.ts`, `change password` |
| [`frontend/profiles.md`](frontend/profiles.md) | `frontend/tests/integration/profiles.test.ts`, `profiles` |
| [`frontend/mail.md`](frontend/mail.md) | `frontend/tests/integration/mail.test.ts`, `the mail of the calendar` |
| [`frontend/mail-settings.md`](frontend/mail-settings.md) | `frontend/tests/integration/mail-settings.test.ts`, `the daily mail settings` |

### Back end

| Page | Explains |
|---|---|
| [`backend/profiles.md`](backend/profiles.md) | `backend/tests/integration/journeys.test.ts`, `profiles` |
| [`backend/calendar-booking.md`](backend/calendar-booking.md) | `backend/tests/integration/calendar.test.ts`, `booking (route 17)` |
| [`backend/calendar-capacity.md`](backend/calendar-capacity.md) | `backend/tests/integration/calendar.test.ts`, `the capacity of a type (AC-37 to AC-44)` |
| [`backend/assistant-text.md`](backend/assistant-text.md) | `backend/tests/integration/assistant.test.ts`, `a conversation in text (5.6, 6)` |
| [`backend/assistant-language.md`](backend/assistant-language.md) | `backend/tests/integration/assistant.test.ts`, `the language of a conversation (4.2)` |
| [`backend/assistant-reading.md`](backend/assistant-reading.md) | `backend/tests/integration/assistant.test.ts`, `reading the calendar (5.1, 8)` |
| [`backend/assistant-booking.md`](backend/assistant-booking.md) | `backend/tests/integration/assistant.test.ts`, `booking through the assistant (5.4, 5.5, 6)` |
| [`backend/assistant-not-confirmed.md`](backend/assistant-not-confirmed.md) | `backend/tests/integration/assistant.test.ts`, `a proposal that is not confirmed (5.5, 6)` |
| [`backend/assistant-confirm-trouble.md`](backend/assistant-confirm-trouble.md) | `backend/tests/integration/assistant.test.ts`, `a confirmation that meets trouble (5.4, 7.4)` |
| [`backend/assistant-note.md`](backend/assistant-note.md) | `backend/tests/integration/assistant.test.ts`, `a note set through the assistant (5.4, 5.5)` |
| [`backend/assistant-move.md`](backend/assistant-move.md) | `backend/tests/integration/assistant.test.ts`, `an appointment moved through the assistant (5.4, 5.5)` |
| [`backend/assistant-cancel-both.md`](backend/assistant-cancel-both.md) | `backend/tests/integration/assistant.test.ts`, `two cancellations in one proposal (5.4, 5.5 rule 4)` |
| [`backend/assistant-daily-limit.md`](backend/assistant-daily-limit.md) | `backend/tests/integration/assistant.test.ts`, `the daily limit (4.4, 6.1)` |
| [`backend/assistant-cannot-answer.md`](backend/assistant-cannot-answer.md) | `backend/tests/integration/assistant.test.ts`, `when Claude cannot answer (6.1, 7.4)` |
| [`backend/assistant-who-may.md`](backend/assistant-who-may.md) | `backend/tests/integration/assistant.test.ts`, `who may talk to the assistant (6)` |
| [`backend/assistant-admin-tools-refused.md`](backend/assistant-admin-tools-refused.md) | `backend/tests/integration/assistant.test.ts`, `a User is not offered the Administrator's tools (3, 7.4)` |
| [`backend/assistant-settings.md`](backend/assistant-settings.md) | `backend/tests/integration/assistant.test.ts`, `a setting changed through the assistant (3, 5.4, 5.5)` |
| [`backend/assistant-booking-for-user.md`](backend/assistant-booking-for-user.md) | `backend/tests/integration/assistant.test.ts`, `the Administrator books for a User through the assistant (3, 5.4, 5.5)` |
| [`backend/assistant-blocking.md`](backend/assistant-blocking.md) | `backend/tests/integration/assistant.test.ts`, `time blocked through the assistant (3, 5.4, 5.5)` |
| [`backend/assistant-blocking-refused.md`](backend/assistant-blocking-refused.md) | `backend/tests/integration/assistant.test.ts`, `a block over an appointment is refused by the calendar (3, 5.4, 8.3)` |
| [`backend/assistant-pattern.md`](backend/assistant-pattern.md) | `backend/tests/integration/assistant.test.ts`, `a weekly pattern created and deleted through the assistant (3, 5.4, 5.5)` |
| [`backend/assistant-full-conversation.md`](backend/assistant-full-conversation.md) | `backend/tests/integration/assistant.test.ts`, `a conversation filled to its bound (4.4, 9)` |
| [`backend/assistant-other-instructions.md`](backend/assistant-other-instructions.md) | `backend/tests/integration/assistant.test.ts`, `a conversation started under other instructions is over (4.3)` |
| [`backend/assistant-places.md`](backend/assistant-places.md) | `backend/tests/integration/assistant.test.ts`, `the places of a type through the assistant (3, 5.5 rule 4, 7.3)` |
| [`backend/assistant-type-capacity.md`](backend/assistant-type-capacity.md) | `backend/tests/integration/assistant.test.ts`, `a type created with a capacity and edited through the assistant (3, 5.4)` |
| [`backend/assistant-mail.md`](backend/assistant-mail.md) | `backend/tests/integration/assistant.test.ts`, `a mail asked for through the assistant (3, 5.4, 5.5)` |
| [`backend/mail-mailer.md`](backend/mail-mailer.md) | `backend/tests/integration/mail.test.ts`, `the mailer run by hand (6.1, 6.3)` |
| [`backend/mail-route.md`](backend/mail-route.md) | `backend/tests/integration/mail.test.ts`, `POST /mail/calendar (6.5, 9.1)` |
| [`backend/mail-daily.md`](backend/mail-daily.md) | `backend/tests/integration/mail.test.ts`, `the daily mail (6.2, 6.3, 9.1)` |
