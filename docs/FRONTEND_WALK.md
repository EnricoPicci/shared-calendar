# Front end — The walk

| | |
|---|---|
| Status | v7 (2026-11-25, `docs/EMAIL_PLAN.md` steps m3 and m4): the week's "E-mail…" dialog is section 12, checks 171 to 180; section 1 says what it needs. v6 (2026-11-25, `docs/EMAIL_PLAN.md` step m2): the four facts of a person and "My details" are section 11, checks 157 to 170; checks 3, 40, 53 and section 1 in line. v5 (2026-11-24, `docs/CAPACITY_PLAN.md` step u5): the capacity of a type is section 10, checks 134 to 156, walked against the local stack that day at both widths (its change log); checks 12, 41, 66 and 70 in line. v4 (2026-11-23, `docs/CHANGE_PASSWORD_PLAN.md` step p3): the password screen is section 9, walked against the local stack that day (its change log). v3 (2026-11-22, `docs/CONVERSATIONAL_PLAN.md` step c13, brief `prompts/a15-step-c13-implementation.md`): the assistant's panel is part of the walk. Run whole on that day in headless Chromium 156, at a desktop width and at a phone width, on a fresh, seeded local stack with the fake Claude: every check answered yes at both. v1 (2026-11-20, `docs/FRONTEND_VIEW_PLAN.md` step 69) was run the same way in Chromium 159 |
| What it is | One list of checks that walks every screen of the front end and the assistant's panel in a browser, as a User and as the Administrator, against the local stack. **The check to repeat after a later change to the view layer** |
| What it is not | A source of truth, and not an automated test. On any conflict `docs/FRONTEND_ARCHITECTURE.md` and the tests win, and this page is fixed. No end-to-end test tool is in the repository (`docs/FRONTEND_VIEW_PLAN.md` section 8, decision 6): a person follows the list by hand, or drives a browser with a script kept outside the repository |
| Made from | The browser checks of `docs/FRONTEND_VIEW_PLAN.md` steps 60 to 68, of `docs/CONVERSATIONAL_PLAN.md` step c12 and of `docs/CAPACITY_PLAN.md` step u5, in the order a person would follow, and `docs/SHARED_CALENDAR_SPEC.md` section 16.8 |

### Change log

| Version | Date | Change |
|---|---|---|
| v1 | 2026-11-20 | First version: 102 checks. |
| v2 | 2026-11-21 | `docs/FRONTEND_DEPLOY_PLAN.md` step 71: "Sign out" also tells Cognito. Check 4 now looks at that request too (mark `[N]`); 102 checks still. Check 4 was done in that step's browser check, by a script; the walk was not run again in full. |
| v2, note | 2026-11-21 | `docs/FRONTEND_DEPLOY_PLAN.md` step 73: section 1 says where the walk stands at the deployed page. No check changed. |
| v3 | 2026-11-22 | **The assistant's panel**: section 6, checks 103 to 122, against the fake Claude, with what they need and leave in section 1; the short list for the real model and what a screen reader says of the panel, not yet listened to, in section 7; the row of step c12 in section 8. No earlier check changed its number. Two lines corrected by the run: check 5 (on a Sunday the week of today has no window and its legend is empty) and check 90 (saving a day is one write, followed by a read of the date). 122 checks. |
| v4 | 2026-11-23 | `docs/CHANGE_PASSWORD_PLAN.md` step p3: **the password screen**, section 9, checks 123 to 133, as `alice` and as `admin`, with what they need and leave in its opening; it is walked last, after section 6, since it changes both local passwords, and puts them back itself. Checks 3 and 40: "Password" is last in each role's navigation. The row of step p3 in section 8. No earlier check changed its number. 133 checks. |
| v3, note | 2026-11-23 | The branch `deploy-frontend` merged into `main`: the panel's version, first numbered v2, is v3, after the sign-out's v2. Walked on the merged page that day by a script in headless Chromium, at a desktop and a phone width, against the local stack with the fake Claude, as `alice`: checks 3, 4 (one `RevokeToken`, answered 200) and 103 to 105, then "Sign out" while the panel waited for an answer (the login at once, the panel gone, no `continue` sent after it, the conversation read again at the next sign-in); all yes. The console held `zod`'s `eval` probe only. The rest of the walk was not run again. |
| v5 | 2026-11-24 | `docs/CAPACITY_PLAN.md` step u5: **the capacity of a type**, section 10, checks 134 to 156, with what they need and leave in its opening; the row of step u5 in section 8. Check 12: the Administrator's booking for `alice` makes `alice`'s attempt a `user_busy`, whose sentence it quotes. Check 41: the tab "Full" beside an appointment. Checks 66 and 70: "Edit" in the place of "Rename", and the capacity. Walked that day by a script in headless Chromium (Playwright 1.62), at 1280 × 800 and at 390 × 844, on a fresh, seeded local stack, as `admin`, `alice` and three Users of the run: every check of section 10 answered yes at both widths, and check 12 as written; at check 140 the tab "1 left" was seen on top and within reach, not pressed, and check 150 was seen on the screenshots, its tabs not pressed. The console held the known report of `zod` and the browser's own line for each answer 409 of checks 144, 145, 146 and 152. The rest of the walk was not run again. 156 checks. |
| v6 | 2026-11-25 | `docs/EMAIL_PLAN.md` step m2: **the four facts of a person**, section 11, checks 157 to 170: the users screen's form and its refusals, a row's name and e-mail, the Edit dialog, "My details" for both roles; the facts every user of the walk is given (section 1); checks 3 and 40 (the navigation's "My details") and 53 (a row) in line; the row of step m2 in section 8. Walked on the local stack that day at a desktop width: 157, 158, 160, 161, 163, 165, 166 as `admin` and 169 as `alice`; 159, 162, 164, 167, 168 and 170 not yet. |
| v7 | 2026-11-25 | `docs/EMAIL_PLAN.md` steps m3 and m4: **the mail of two dates**, section 12, checks 171 to 180: the week's "E-mail…" dialog for both roles, a refused range, the address masked, the mail and its file at the fake mail, the limit of five a day, the phone width; section 1 gains `local:lambda` and the fake mail; the row of m4 in section 8. Section 11's checks 159, 162, 164, 167, 168 and 170 walked that day (168 at 606 px, the narrowest the browser of the walk allowed). |

---

## 1. Before the walk

**What it needs.**

- A local stack, fresh: `npm run local:down -w backend`, `npm run local:up -w backend`, in a
  Codespace the iptables rule of `CLAUDE.md`, then `npm run local:api -w backend`.
- The seed: `npm run seed:local -w frontend`, once, **on a stack on which the back end's
  calendar journeys have not run**: they empty the local `calendar` table and leave data of
  their own in it, a type "Studio" among them, after which the seed does nothing. So the root
  `npm run verify` and the walk need a restart of the stack between them. It gives the types "Studio" and "Piscina",
  eight weekly patterns (Studio 09:00 to 13:00 from Monday to Friday, Piscina 15:00 to 18:00 on
  Tuesday and Thursday and 10:00 to 12:00 on Saturday) and a few appointments of `alice`.
- The page: `npm run dev -w frontend`, on http://localhost:5173.
- The two local accounts of `CLAUDE.md`: `alice`, a User, and `admin`, the Administrator.
- **A second window**, for the checks marked `[2]`: a private window of the browser, signed in as
  the other person. A second tab of the same window works too; a reload of the first page does
  not, since it signs out.
- **A tag for the run**, a few lowercase letters and digits (say `w7`). Every name and every
  note the walk writes carries it (`walk-w7`), so that what one run made can be told from the
  seed's and from another run's.
- **The four facts of every user the walk creates**: first name `Walk`, last name the user's
  name after `walk-` (`w7-b`), e-mail `<the username>@example.com`, postal address
  `Via di Prova 1` on one line and `00100 Roma` on a second. "Create user" without them is
  refused (check 54).
- **For the assistant's panel (section 6): the fake Claude**, which is what `local:up` wires
  when no `ANTHROPIC_API_KEY` is given (`docs/COMMANDS.md` section 3.4), and the local limit of
  10 messages a person a day. Section 6 is never walked with the real Claude wired: its
  sentences mean something to the fake only. What is done with the real one is in section 7.
- **For the mail (section 12): `npm run local:lambda -w backend`**, a third terminal beside
  `local:api` and `dev`, which runs the mailer, and the fake mail of `local:up` at
  http://localhost:8025, which keeps what it sends (`docs/COMMANDS.md` section 3.5). A program
  that opens an `.xlsx` file. Each account may ask for five mails a local day; a fresh stack
  starts them again.
- **Two dates.** *The walk's date*: the first Wednesday that is at least 35 days after today
  (the seed gives it Studio 09:00 to 13:00, and a booking so far ahead is still allowed). *Next
  week*: the week after the one of today, where the seed leaves free slots on every weekday.
- **Three more dates, for section 6.** *The three early days*: the 25th, the 26th and the 27th
  day from today, on which the fake's sentences read and book at 05:00.

**Before section 6**, as `admin`, after check 102:

- in "Availability" create the type `walk-<tag> early` and, in "A single date", show each of
  the three early days and add the extra window 05:00 to 07:00 of that type;
- in "Users" create `walk-<tag>-a` and note its password: the section is walked as this User,
  **so that `alice` keeps her day's messages**;
- the section sends **exactly ten messages** as that User, the ten of a day: one each at checks
  105, 106, 107, 111, 114, 116, 118 and 119 and two at check 115. The tenth is the one that
  meets the limit at check 119, so a message more on the way brings check 119 early and leaves
  the checks after it undone: start again with another User (`walk-<tag>-a2`). A run at the
  other width is a run of its own, with its own tag and so its own User. `admin` sends one
  message, at check 121.

**At the deployed page.** The walk is written for the local stack, and has been run in full
there only. The page deployed on 2026-11-21 is the same page; a part of the checks was done at
it that day, at a desktop width, with data made by hand through the page (the seed refuses any
address but the laptop's, on purpose). What was done, and the rest of the walk with the phone
width, still to do there, are in `docs/RUNBOOK.md` section 5.5.

**What it changes, and what it leaves.**

- It changes **none of the seed's** types, patterns or appointments: it books, moves and cancels
  appointments of its own, and creates and deletes a type, patterns, a date's windows and users
  of its own.
- It writes the settings back as it found them (note the four values before check 20). Check
  121 changes "Booking horizon" through the assistant and puts it back in the form.
- Section 6 removes its type, its three windows and its User at check 122. What stays of it: in
  the `calendar` table the appointment of check 113, cancelled with its User; in the
  `assistant` table the conversations and the day's count of a User that no longer exists,
  which nobody reads, and one message less in `admin`'s day.
- **What stays in the local table as history**: the appointments the walk cancelled or moved,
  their events, and the deleted-user markers of the users it deleted. Appointments cannot be
  deleted through the API.
- If a run is cut short: sign in as `admin` and remove what carries the run's tag, in this
  order: the appointments (cancel them in the week), the windows of the walk's date ("Back to the
  weekly patterns", the extra windows), the patterns of the type `walk-<tag>`, the type, the
  users `walk-<tag>…` (deleting `walk-<tag>-a` cancels its appointment of an early day), the
  extra windows of the three early days, the type `walk-<tag> early`; then put the settings
  back.

**How to read a check.** Each check is one thing to do and what must be seen: answer "yes" or
"no". The marks:

| Mark | Meaning |
|---|---|
| `[K]` | At a desktop width, done **by keyboard only**: Tab and Shift+Tab to reach, Enter or the space bar to press, Escape, the arrow keys or typing to choose in a list, typing in a field. Between them the marked checks reach every action of every screen |
| `[=]` | The width of the window cannot change the answer: the phone run may skip it |
| `[2]` | Needs the second window |
| `[N]` | What must be seen includes the requests the page makes: look in the Network panel of the browser's tools |
| `[S]` | A person cannot do it (a modal dialog keeps "Sign out" out of reach): only a script can, standing for a session that ends by itself. By hand, skip it |

"Offline" means the browser's own switch (the Network panel's "Offline"), which stands for a
server that cannot be reached; "online" puts it back.

**At every screen, at both widths**: the page never scrolls sideways (at a phone width the days
of the week scroll sideways inside their own box, the page does not), and every button and
field is inside the window. **At the end**: the browser's console shows no error and no report
of the Content-Security-Policy other than the known one of `zod`
(`docs/FRONTEND_ARCHITECTURE.md` section 10, open point O5).

The widths: 1280 × 800 for the desktop, 390 × 844 for the phone.

---

## 2. The login

1. `[K]` Sign in as `alice` with a wrong password. → A sentence in plain words says the username
   or the password is wrong; the form is still usable, the username still in its field.
2. `[=]` Sign in as `alice` with the right password, and watch the button. → "Sign in" is
   disabled while the call is under way (the first call after the stack starts takes seconds).
3. `[K]` → The frame: the header says `alice` and "User"; the navigation holds "Week", "My
   appointments", "My details" and "Password" and nothing else; the address ends in `#/week`.
4. `[K]` `[N]` Press "Sign out". → The login again, at once, both fields empty, no failure shown.
   In the Network panel: one request to `/cognito/` sent at the press, its header
   `X-Amz-Target` ending in `RevokeToken`, answered 200. (With the local Cognito stopped the
   login shows just the same and nothing on the page says the request failed: not a check
   of the walk, which needs the stack whole.)

## 3. A User (`alice`)

Sign in as `alice`.

**The week.**

5. → The week of today: its label (two dates and the year), "Times are in the calendar's time
   zone, Europe/Rome.", the legend with "Piscina" and "Studio", seven days with today marked.
   (A walk on the day of the seed, when that is a Sunday: the seed's patterns start today and
   give a Sunday nothing, so the week of today has no window and its legend is empty; the
   legend is then seen at check 6.)
6. `[K]` Press "›" (next week). → "Loading…" shows and the week is dimmed while it loads; then
   next week, with Studio's windows on its weekdays, free slots ("09:00–10:00 free") and
   `alice`'s own appointments, which say "You".
7. `[K]` Press "‹", then "Today". → The week before, then the week of today again.
8. → At a desktop width the seven days stand side by side; at a phone width they scroll
   sideways inside their box, and the page itself does not.

**Booking.** In next week.

9. `[K]` Press the free slot of Tuesday 10:00–11:00. → The dialog "Book an appointment" names
   the day, the time and "Studio"; it has the note and no "For", "Start" or "End".
10. `[K]` Type the note `<b>walk-<tag></b> one` and press "Book". → The dialog closes; the
    appointment is in the week at Tuesday 10:00–11:00, says "You", and shows the note as text,
    with `<b>` readable in it.
11. `[K]` Press another free slot, then the Escape key. → The dialog opened with an empty note
    and no failure, and Escape closed it; nothing was booked.
12. `[2]` Leave the week as it is. In the second window, as `admin`, book the free slot of
    Tuesday 11:00–12:00 for `alice` (note `walk-<tag> elsewhere`). Back in the first window,
    press that slot, still shown as free, and "Book". → The booking is refused in plain words,
    since `alice` already holds that time ("You already have an appointment at this time. To
    move it, change that appointment instead."; the page did not hold the appointment, so it is
    not named), with no "Book anyway"; the dialog stays open, and behind it the week is read
    again: the slot is gone and the appointment is there. Close the dialog. In the second
    window, cancel that appointment. A full time refused to a User is check 144.

**The detail and the note.**

13. `[K]` Press the appointment of check 10. → The dialog "Appointment": when, the type, "You",
    the note in a field, "Booked by you on …", the sentence "It can be changed or cancelled
    until …", and the buttons "Close", "Change" and "Cancel appointment".
14. `[K]` Change the note to `walk-<tag> two` and press "Save note". → The dialog closes, and
    the appointment in the week shows the new note.
15. `[K]` Open it again, empty the note, "Save note". → The dialog closes; the appointment
    shows no note. Open it once more: the field is empty; "Save note", unchanged. → It closes
    with no failure. Put the note `walk-<tag> two` back the same way.
16. `[K]` Open it and press the Escape key. → The dialog closes, and the keyboard is back on
    the appointment (Enter opens it again).

**Moving an appointment to another time.**

17. `[K]` Open it and press "Change". → The dialog closes; a banner says "Moving: Tue …,
    10:00–11:00 · Studio. Choose a free time." with "Keep the appointment as it is"; no
    appointment of the week can be pressed.
18. `[K]` Press "›" and, in that later week, the free slot of Thursday 09:00–10:00. → The banner
    stayed through the change of week. The dialog says "Change appointment", "From:" the old
    time and "To:" the new one, and the note's field holds `walk-<tag> two`.
19. `[K]` Press "Change". → The dialog closes and the banner goes; the appointment is at
    Thursday 09:00–10:00 with its note; back in next week, Tuesday 10:00–11:00 is free again.
20. `[K]` Open the appointment, "Change", then "Keep the appointment as it is". → The banner
    goes and everything is as it was. Then: "Change" again, press a free slot, "Close" the
    confirmation. → The banner is still there. Press "Keep the appointment as it is".
21. `[2]` Start the move again. In the second window, as `admin`, book the free slot of Friday
    09:00–10:00 of that week for `alice` (note `walk-<tag> elsewhere`). In the first window
    press that slot and "Change". → Refused in plain words; the dialog stays open, the banner
    stays, the old appointment is where it was. Close, "Keep the appointment as it is". In the
    second window, cancel the Friday appointment.

**What the settings decide.** Note the four values of the settings first (second window,
`admin`, "Settings").

22. `[2]` In the second window set "Minimum booking notice" to 720 and save. In the first, on
    the week still showing its slots, press a free slot and "Book". → Refused in plain words
    ("This time is too soon to be booked…"); behind the dialog the week is read again and has no
    free slot left.
23. `[2]` With the same setting: second window, set it back to its value, save. First window:
    "Today", "›", start to move the appointment of check 19. Second window: 720 again, save.
    First window: press a free slot and "Change". → Refused in plain words, the banner stays.
    Close, "Keep the appointment as it is". Second window: put the value back.
24. `[2]` In the second window set "Cancellation notice" to 720 and save. In the first, without
    loading the week again, open the appointment and press "Cancel appointment". → Refused: "It
    is too late to cancel this appointment."; the dialog stays open.
25. `[2]` Close it, press "Today" and come back to the appointment's week, open it. → The
    sentence says "It is too late to change or cancel this appointment."; "Change" and "Cancel
    appointment" are not there; the note can still be saved (save `walk-<tag> three`: the dialog
    closes and the week shows it). In the second window put "Cancellation notice" back.
26. `[2]` In the second window set "Maximum upcoming appointments per person" to 1 (untick "No
    limit") and save. In the first: "Today", back to the appointment's week, open it, "Change",
    a free slot, "Change". → Refused with the words of a move: "You have more upcoming
    appointments than the calendar now allows, so this one cannot be moved. Cancel one first."
    Close, keep. In the second window tick "No limit" (or put the value back) and save.

**Cancelling.**

27. `[K]` Load the week again ("Today", then back), open the appointment and press "Cancel
    appointment". → One press cancels: the dialog closes, the appointment is gone, its hour is a
    free slot again.

**My appointments.** First book two more, in next week: Wednesday 10:00–11:00 with the note
`walk-<tag> list` and Wednesday 11:00–12:00 with `walk-<tag> gone`.

28. `[K]` `[N]` Press "My appointments". → "Upcoming" is the mode chosen; the list holds
    `alice`'s upcoming appointments, the seed's and the two just booked, each with its date,
    time, type, note and "Booked", in the order of their time. The page asked for the settings,
    then for the list, and for nothing else.
29. `[K]` Press "History". → A form with two dates, the 30 days that end today, and at once the
    list of that period (on a fresh stack: "There are no appointments in this period.").
30. `[K]` Set "To" to a date 60 days from today and press "Show". → The appointments of the
    period: the one cancelled at check 27 says "Cancelled", the one moved at check 19 has a row
    at its old time that says "Changed", the others "Booked".
31. `[=]` Empty "From" and "Show"; then "From" after "To"; then a period of more than 92 days. →
    Each is refused in words beside the form ("Choose both dates.", "The first date is after the
    last one.", "A period can be at most 92 days long…"), `[N]` with no request, and the list
    stays.
32. `[K]` Press the row that says "Changed", then, after "Close", the one that says "Cancelled".
    → The detail says "This appointment was moved to another time.", then "This appointment was
    cancelled."; neither has a field for the note, "Change" or "Cancel appointment".
33. `[K]` "Upcoming". Press the row with `walk-<tag> list`, change the note to `walk-<tag>
    listed`, "Save note". → The dialog closes and the row shows the new note.
34. `[K]` Press that row and "Change". → The address ends in `#/week`; the week is the one of
    the appointment, with the banner that names it.
35. `[K]` Press "My appointments", then "Week". → The list is as usual, on "Upcoming"; the week,
    shown again, has no banner: leaving it ended the move.
36. `[K]` In "My appointments" press the row with `walk-<tag> gone` and "Cancel appointment". →
    The dialog closes and the row is gone from "Upcoming".
37. Go from "Week" to "My appointments" and back twice by the links, then twice with the
    browser's back button. → Each time one screen is shown, with one week or one list: no row,
    day or banner is doubled or left over.
38. `[=]` Type the address `#/settings` by hand, then `#/users`, then `#/availability`. → Each
    time the week is shown and the address becomes `#/week`; no link to them is in the
    navigation.
39. `[S]` Open a row's detail and, with it open, end the session. → The login; after `alice`
    signs in again nothing of the dialog is left, and it is closed.

## 4. The Administrator (`admin`)

Sign out, sign in as `admin`.

40. `[K]` → The header says `admin` and "Administrator"; the navigation holds "Week",
    "Settings", "Users", "Availability", "My details" and "Password", and no "My appointments". `[=]` The address
    `#/appointments`, typed by hand, shows the week.

**The week.** In next week.

41. → Every appointment carries its User's name: `alice`'s say "alice", none says "You". At the
    right of each, a narrow tab "Full", the slot its appointment fills (check 150).
42. `[K]` Press the free slot of Monday 09:00–10:00. → The dialog has "For", a list that holds
    `alice`, and "Start" and "End", two lists of times a quarter of an hour apart, set to 09:00
    and 10:00. Choose `alice`, type the note `walk-<tag> admin`, "Book". → The appointment is
    there, with "alice".
43. `[K]` Press the free slot of Monday 10:00–11:00, set "Start" to 10:15 and "End" to 10:45,
    choose `alice`, note `walk-<tag> custom`, "Book". → An appointment 10:15–10:45 of `alice`.
44. `[K]` Open the appointment of check 42. → No sentence about until when; "Change" and "Cancel
    appointment" are there. Press "Cancel appointment". → It is gone.
45. `[K]` Open the appointment of check 43, "Change", press the free slot of Monday 12:00–13:00.
    → The confirmation has "Start" and "End" and no "For". Set them to 12:15 and 12:45,
    "Change". → The appointment is at 12:15–12:45, still `alice`'s. Then cancel it.

**The settings.**

46. `[K]` Press "Settings". → The four values, each with its range in words under it ("hours,
    from 0 to 720", …), "No limit" ticked or not, the time zone with the sentence that it cannot
    be changed here, and the line about who saved last and when.
47. `[K]` `[=]` Type 721 in "Cancellation notice", -1 in "Minimum booking notice", empty
    "Booking horizon", and "Save"; then 1.5 and the letter e in two of them, and "Save". → Each
    field in fault has a red border and its sentence under it ("… must be a whole number from …
    to …."), `[N]` and no request is sent.
48. `[K]` Put the values back, set "Booking horizon" to one less than it was, "Save". →
    "Settings saved."; the line about the last save names `admin` and this minute. Sign out,
    sign in: the value is there. Typing in a field takes "Settings saved." away.
49. `[K]` Tick "No limit". → Its number field cannot be typed in. Untick it, type 3, "Save",
    then tick it and "Save". → Saved both times; `[N]` the second save sends no number for it.
50. Go offline, change a value, "Save". → A failure in plain words above the button; what was
    typed stays. Go online, "Save". → Saved.
51. `[2]` With "Booking horizon" set to 3 and saved: in the second window, as `alice`, look at
    next week. → It has no free slot later than three days from today. Put the horizon back.
52. `[=]` Put the four values back as they were found, and save. → "Settings saved."

**The users.**

53. `[K]` `[N]` Press "Users". → The list, with `alice` and without `admin`, each row with
    the name, the e-mail, "Edit" and "Delete"; one request, `GET /users`.
54. `[K]` `[=]` Type `Bob` and press "Create user"; then `ab`. → Refused under the field, in
    the words of the hint, which is shown once, in red; `[N]` no request.
55. `[K]` Type `alice`, "Create user". → A failure in plain words under the field's box: a user
    with this username exists already. The field is not marked.
56. `[K]` Type `walk-<tag>`, "Create user". → The dialog "User created": the username, a
    password, "This password cannot be shown again. Give it to the user now." and one button.
    Behind it the list has the new user.
57. `[K]` Press the Escape key, once and then many times; press Enter; click outside the dialog.
    → It stays open. One Tab reaches "I have noted the password".
58. `[2]` In the second window sign in as `walk-<tag>` with the password shown. → The frame, with
    that name and "User". Sign out there.
59. `[K]` Press "I have noted the password". → The dialog closes. The password is nowhere: go to
    "Week" and back to "Users", and it is not in the page nor in the address.
60. `[S]` Create `walk-<tag>-s` and, with the password dialog open, end the session. → The
    login; signed in again, no dialog and no password anywhere. (Delete that user afterwards.)
61. `[K]` Create `walk-<tag>-b` and close its dialog. In "Week", next week, press a free slot. →
    "For" lists `alice`, `walk-<tag>` and `walk-<tag>-b`. Book the slot of Monday 09:00–10:00
    for `walk-<tag>-b`, and the slot of Wednesday 12:00–13:00 for `walk-<tag>`.
62. `[K]` In "Users" press "Delete" on the row of `walk-<tag>-b`. → A dialog names the user,
    says that their future appointments will be cancelled and that this cannot be undone; the
    keyboard is on "Keep". Press Enter. → Nothing was deleted.
63. `[K]` "Delete" again, then "Delete user". → The dialog closes and the row is gone; in the
    week the appointment of Monday 09:00–10:00 is gone.
64. Create `walk-<tag>-c`. Go offline, "Delete" on its row, "Delete user". → The failure is said
    in the dialog, which stays open. Go online, "Delete user" again. → Deleted.
65. `[2]` Create `walk-<tag>-d`. In "Week", press a free slot and choose `walk-<tag>-d` in
    "For"; leave the dialog open. In the second window, as `admin`, delete `walk-<tag>-d`. In
    the first, "Book". → Refused: "This user no longer exists."

**The availability: the types and the weekly patterns.**

66. `[K]` `[N]` Press "Availability". → Three parts. "Types": "Piscina" and "Studio", each with
    "Edit" and "Delete", and no places beside the name (a capacity of one); the form has "Name"
    and "Capacity", set to 1. "Weekly patterns": the seed's eight, under "Monday" to "Saturday",
    each with its hours ("09:00 – 13:00"), its type and its validity with the year. Three
    requests: the settings, the types, the patterns.
67. `[K]` `[=]` In "Types" press "Create type" with an empty name, then with a name of 41
    letters. → Refused under the field, in the words of the hint; `[N]` no request.
68. `[K]` Type `studio`, "Create type". → The server's refusal in plain words: a type with this
    name exists already.
69. `[K]` Create the type `walk-<tag>`. → It is in the list, and the field is empty again.
70. `[K]` Press its "Edit". → The dialog "Edit type" with the name and the capacity 1 in their
    fields, the keyboard on the name. Change it to `walk-<tag> two`, "Save". → The dialog
    closes; the list has the new name.
71. `[K]` In "Weekly patterns" choose Sunday, 05:00, 07:00, the type `walk-<tag> two`, and press
    "Create pattern". → Under "Sunday": "05:00 – 07:00", the type, "from" today's date.
72. Press "Week", then "›". → With no reload of the page: Sunday has a window 05:00–07:00 of the
    new type with two free slots, the hours start at 05:00, and the legend names the type.
73. `[=]` In "Availability", "Create pattern" with "End" not later than "Start", no type chosen,
    "Valid from" emptied, then with "Valid until" before "Valid from". → Each field in fault is
    marked and has its sentence under it, `[N]` with no request.
74. `[K]` Create a second Sunday pattern, 06:00 to 08:00, same type. → Refused by the server,
    under the fields: another window of the same day covers part of these hours.
75. `[K]` Press "Delete" on the type `walk-<tag> two`, then "Confirm". → The dialog "Please
    confirm" asked with the type's name; refused in it: the type is in use. "Keep".
76. `[K]` Press "Change" on the Sunday pattern. → A dialog with its six fields filled. Set "End"
    to 24:00, "Change". → The row says "05:00 – 24:00". Change it back to 07:00.
77. `[K]` Create a pattern on Sunday, 01:00 to 02:00, same type, valid from 1 to 31 January of
    this year. → It is listed, with the word "ended" and a quieter look. Press its "Delete",
    "Confirm". → Gone.
78. In "Week", next week, book the Sunday slot of 05:00–06:00 for `alice` (note `walk-<tag>
    way`). In "Availability", "Change" the Sunday pattern to start at 06:00. → Refused in the
    dialog: "This would leave booked appointments outside the hours open for booking…", and
    under it "1 appointment is in the way:" with its date, its time and `alice`. "Close".
79. `[K]` "Delete" on that pattern, "Confirm". → Refused in the dialog, with the same list.
    "Keep".
80. Cancel that appointment in the week. In "Availability" delete the pattern: "Delete",
    "Confirm". → The dialog closes and the pattern is gone.
81. Go offline; type `walk-<tag> off` and "Create type". → A failure in plain words in the form.
    Go online, "Create type" again. → Created. Delete it ("Delete", "Confirm").

**The availability: a single date.** With the walk's date.

82. `[N]` → The part "A single date" has its date field on today and shows no day; opening the
    screen asked for nothing about a date.
83. `[K]` `[N]` Type the walk's date and press "Show" (or Enter in the field). → One request. The
    date in words with its weekday and year; "As the weekly patterns give it": "09:00 – 13:00"
    Studio; "As it is now": "The weekly patterns apply on this day.", with "This day only…" and
    "Not available on this day" and no "Back to the weekly patterns"; "Extra windows": "This day
    has no extra windows."
84. `[=]` Empty the date and "Show"; then yesterday's date. → Refused under the field ("Choose a
    date.", "A date before today cannot be changed…"), `[N]` no request, the day on show stays.
    Show the walk's date again.
85. `[K]` Press "This day only…". → A box "This day only" with one row, "09:00 – 13:00" Studio
    and "Remove"; the day's own buttons are no longer shown.
86. `[K]` In the box: "Add" with "End" not later than "Start" and no type. → Both said under
    their fields. Then add 14:00 to 15:00 of `walk-<tag> two`. → A second row, in the order of
    the hours; the form is back on 09:00, 10:00 and no type.
87. `[K]` Add 12:00 to 14:30, Studio. → Refused: **"Start" and "End" both have a red border, and
    the sentence ("Start and End overlap another window of this day. Choose other hours.")
    stands once, under "Start"**. Then add 13:00 to 14:00, Studio, which only touches. →
    Accepted.
88. `[K]` Press "Remove" on the row 13:00 – 14:00. → That row is gone, the others stay.
89. `[=]` With the box open, press "Show". → Refused under the date: "Save or discard the
    changes to this day first."; `[N]` no request.
90. `[K]` `[N]` Press "Save this day". → One write, `PUT /calendar/overrides/<date>`, then the
    date is read again. The box closes; "As it is now" says "This
    day has its own windows, in the place of the weekly patterns." and lists the two; "Back to
    the weekly patterns" is offered. In "Week", the week of the walk's date: that day has the
    two windows; the same weekday a week later has Studio 09:00–13:00 as before.
91. `[K]` "This day only…", "Remove" a row, then "Discard". → The day is as it was saved. In
    "Extra windows" add 16:00 to 17:00, Studio ("Add window"). → Listed, with "Delete"; the
    week shows it. Then add 14:30 to 15:30. → Refused by the server in the form: another window
    covers part of these hours.
92. In "Week" book for `alice`, on the walk's date, the slot of 14:00–15:00 (note `walk-<tag>
    own`) and the slot of 16:00–17:00 (note `walk-<tag> extra`). Then, on the date: `[K]` "This
    day only…", "Remove" the row 14:00 – 15:00, "Save this day" → refused under the rows, with
    "1 appointment is in the way:" and its date, time and `alice`; "Discard". `[K]` "Not
    available on this day", "Confirm" → the question said that the extra windows stay; refused
    in the dialog with the list; "Keep". "Back to the weekly patterns", "Confirm" → refused with
    the list; "Keep". "Delete" on the extra window, "Confirm" → refused with the list; "Keep".
93. Cancel the two appointments in the week. Then, on the date: `[K]` "Not available on this
    day", "Confirm" → "This day is not available: the weekly patterns do not apply.", and the
    week shows only the extra window that day. `[K]` "Back to the weekly patterns", "Confirm" →
    "The weekly patterns apply on this day." Go offline, "Delete" on the extra window, "Confirm"
    → the failure in the dialog, which stays; online, "Confirm" → deleted.
94. With the date on show: create a pattern for its weekday, 19:00 to 20:00, `walk-<tag> two`. →
    "As the weekly patterns give it" gains "19:00 – 20:00" with no "Show" pressed. Delete that
    pattern → it goes. Then delete the type `walk-<tag> two`. → The two lists are the seed's
    again.

## 5. Both

95. `[S]` As `admin`, on "Availability", with a date on show, the box of "this day only" open
    and the dialog that confirms open: end the session. Sign in as `alice`. → Nothing of the
    Administrator's is in the page (no link, no date, no dialog); `[N]` her page asks for none
    of the Administrator's routes.
96. As `alice`, in next week. → Wednesday 12:00–13:00, booked for `walk-<tag>` at check 61, is a
    block that says "busy", with no name, and cannot be pressed.
97. Start to move one of the walk's appointments (book one first: Thursday 11:00–12:00, note
    `walk-<tag> last`), and with the banner on show press "Sign out". Sign in again. → No
    banner.
98. `[2]` With next week on show, in the second window, as `admin`, book a free slot for
    `alice` (note `walk-<tag> elsewhere`). Switch to another tab of the first window and come
    back. → The week is read again and shows the booking. With a dialog open, the same: the
    dialog stays as it is. (A headless run sends the page the event of a tab shown again; the
    real switch is in section 7.) Cancel the two appointments of checks 97 and 98.
99. Go offline and press "›". → A failure in plain words above the week; the week that was on
    screen is still there. Go online, "Today". → The failure goes.
100. Type the address `#/nonsense` by hand. → The week, and the address becomes `#/week`; the
     browser's back button does not come back to `#/nonsense`.
101. Reload the page. → The login: a reload signs out (`docs/FRONTEND_ARCHITECTURE.md` section
     10, open point O3).
102. As `admin`, in "Users", `[K]` delete `walk-<tag>` (and any other user of the run). → Gone;
     its appointment of Wednesday is gone from the week. The users, the types, the patterns and
     the settings are those the walk found.

## 6. The assistant's panel

Against **the fake Claude** (section 1), as the User `walk-<tag>-a` made before the section.
Every sentence to send is one that `backend/tests/integration/fake-claude/answers.json`
answers: type it exactly. The panel is at the bottom of every screen
(`docs/FRONTEND_ARCHITECTURE.md` section 6.1); "the heading" is its button "Assistant", "the
bar" is the panel collapsed. The count of messages left is the one of a User who sent none
today.

103. `[N]` Sign out. → The login has no panel: no "Assistant", no "Message". Sign in as
     `walk-<tag>-a`. → At the bottom of the window, one bar: the heading "Assistant", the field
     "Message" and "Send", with neither "New conversation" nor "Close". The same bar on "My
     appointments" and back on "Week". The page has asked nothing of `/assistant`.
104. `[K]` `[N]` Reach the field "Message" (by Tab; by hand at a phone, a touch). → The panel
     opens upward, to about half of the window at a desktop width and most of it at a phone
     width: the heading, "New conversation" (out of use) and "Close", the line "This
     conversation is processed by Anthropic's Claude.", no message, "10 messages left today".
     One request, `GET /assistant/conversation`.
105. `[K]` Type `Hello, can you hear me?` and press Enter. → The text under "You", on the right;
     the answer under "Assistant", on the left: "Hello. I am the assistant of the shared
     calendar." The field is empty and the keyboard still in it; "9 messages left today"; "New
     conversation" is in use.
106. `[N]` Send `fake: what is open on the day of the journey?` and, while it works, type
     something in the field. → A line of progress ("…") under the conversation and "Send" out
     of use while it works (by hand, for a moment only); then the answer, the first early day as
     the fake gives it, a text with `"05:00"` in it. What was typed meanwhile is still in the
     field, "Send" is in use again, "8 messages left today". Two requests: `POST
     /assistant/messages`, then `POST /assistant/continue`. Empty the field.
107. Send `<b>walk-<tag></b> <i>markup</i>`. → Shown as typed, with `<b>` and `<i>` readable.
     The answer: "Fake Claude: no answer is scripted for this message."
108. `[N]` Type `half a text` in the field and do not send it. Go to "My appointments" and back
     to "Week". → The panel stays open, with the conversation and the text in the field. Press
     "Close". → The bar, the text still in its field. Go to "My appointments". → Still the bar.
     Press the heading. → Open, as it was. Nothing was asked of `/assistant` in all of this.
     Empty the field.
109. `[K]` With the panel open, Tab from the heading. → The order: "Assistant", "New
     conversation", "Close", the conversation itself once it is long enough to scroll (the
     arrow keys then scroll it), the field, "Send". In the field, press the Escape key. → The
     panel collapses and the keyboard is back where it was before it came into the panel, on
     the last thing of the screen above: one Tab reaches the heading. Enter there. → Open. Two
     Tabs and Enter, on "Close". → Collapsed, the keyboard back in the screen as before. In the
     bar the order is "Assistant", the field, "Send", and the field taking the keyboard opens
     the panel.
110. `[N]` Reload the page and sign in again as `walk-<tag>-a`. → The bar, and nothing asked of
     `/assistant`. Press the heading. → One request, and the same conversation: its six
     messages, "7 messages left today".
111. In "Week", go to the week of the second early day. Send `fake: book me the slot of the
     booking journey`. → Under the last message, which stays in sight, a block: "Make this
     change?", the line "Book an appointment on …, from 05:00 to 06:00 (walk-<tag> early)."
     with the weekday and the date in full, and the buttons "Confirm" and "Don't". Behind the
     panel the slot 05:00–06:00 of that day is still free. "6 messages left today".
112. Press "Close", then a free slot of the week. → The book dialog; under it the bar cannot be
     pressed and Tab does not reach it. The Escape key closes the dialog and leaves the bar as
     it is. Press the heading. → The proposal still waits, its two buttons in use.
113. `[K]` `[N]` From the field, Shift+Tab twice: "Don't", then "Confirm". Press Enter. → Both
     buttons are out of use while it works. Then the block has no buttons and its line says
     "Done", a closing answer of the assistant follows, and the keyboard is in the field.
     Behind the panel, with nothing pressed, the week shows the appointment at 05:00–06:00,
     "You". The requests: `POST /assistant/proposals/<id>/confirm`, then a `GET /calendar?…`.
     Still "6 messages left today": confirming is no message.
114. `[K]` Send `fake: book me the slot of the declining journey`. → A proposal for the third
     early day; "5 messages left today". Press "Don't". → The block is gone; a message under
     "Notice", in the middle: "Nothing was changed."; the keyboard is in the field; the slot is
     still free; still 5 left.
115. Send the same sentence again and, when the proposal shows, type `yes` and press Enter. → The
     block goes and a new one comes, the same change with its two buttons: the typed "yes"
     booked nothing, and no notice was added for the proposal it dropped. "3 messages left
     today". Press "Don't".
116. `[N]` Send `fake: overloaded`. → Under the conversation, marked by a bar at its side and not
     written in red: "The assistant is not available at the moment. Please try again in a
     little while. Everything can still be done from the other pages." The text is still in the
     field; the conversation shows the message, which the server kept; "2 messages left today";
     "New conversation" and "Send" are in use. The requests: `POST /assistant/messages`
     (answered 503), then one `GET /assistant/conversation`, and no `POST /assistant/continue`.
117. `[=]` With that sentence on show, look at the panel in the Accessibility part of the
     browser's tools. → A region named "Assistant"; its heading a button named "Assistant",
     with no arrow in the name, said to be expanded; a status that is not on show in the page
     and holds the last answer or notice ("Nothing was changed."); an alert that holds the
     failure's sentence.
118. `[K]` `[N]` Press "New conversation". → No message and no failure; the panel still open, the
     keyboard in the field; still "2 messages left today"; "New conversation" out of use. Send
     `fake: a spending limit of our own`. → "The assistant has reached its spending limit and
     cannot answer for now. Your calendar is not affected: everything can still be done from
     the other pages.", and the rest as at check 116: the text kept, one read after the 503 and
     no `continue`. "1 message left today". Press "New conversation".
119. `[N]` Send `Hello, can you hear me?`. → The answer; "No messages left today"; under the
     conversation "You have reached today's limit of messages to the assistant. It will be
     available again tomorrow. Everything can still be done from the other pages." "Send" is
     out of use and Enter in the field sends nothing (no request); "New conversation" is in use.
120. Sign out, sign in as `alice`. → The bar; nothing of the first person is in the page. Press
     the heading. → No message, no proposal, an empty field, and her own count ("10 messages
     left today" when she sent none today). Send nothing.
121. Sign out, sign in as `admin`. → The bar on "Week", "Users", "Availability" and "Settings".
     On "Settings", note "Booking horizon" (the check shows nothing if it is 57) and send `fake:
     set the booking horizon of the settings journey`. → A proposal: "Change the settings.
     Booking horizon: from … days to 57 days." Press "Confirm". → "Done", and the form behind
     shows 57 with nothing pressed. Press "New conversation" and "Close", set "Booking horizon"
     back and save. → "Settings saved."
122. `[K]` As `admin`: in "Users" delete `walk-<tag>-a`; in "Availability", "A single date",
     show each of the three early days and delete its extra window; then delete the type
     `walk-<tag> early`. → The users, the types, the patterns and the settings are those the
     walk found. The console shows, besides the known report of `zod`, only the browser's own
     line for each of the two answers 503 of checks 116 and 118.

## 7. What only a person, a real browser or time can check

The run of a script in a headless browser cannot say these; they are for a person.

- **A real switch of tab**: check 98 with a real second tab, and the week read again on coming
  back.
- **A real phone**: the touch on a slot, the sideways scroll of the days with a finger, the
  on-screen keyboard over a dialog and over the assistant's panel, the native lists.
- **A screen reader's voice**: that a failure is spoken when it appears, that a field in fault
  is said to be so, that the dialog that confirms speaks its question when it opens, that a
  slot is named with its day, and that a row's button says which row it is of.
- **A screen reader's voice in the assistant's panel: not yet listened to.** The script
  checked what a reader is given (check 117, and the order of Tab at checks 109 and 113);
  nobody has heard it. To listen for: the heading said as "Assistant", collapsed or expanded,
  with no arrow; each new answer and each notice spoken once, when the reader is free, and
  not the person's own text; the line of progress; a failure spoken at once; the proposal's
  question and its changes read before its two buttons, and each outcome ("Done") once it is
  settled; that nothing of the conversation is reached while the panel is collapsed.
- **The native date field's picker**, and the order of day and month it shows in the browser's
  own language.
- **An appointment that has ended**. None can be made through the API. On a stack that was
  seeded the day before, `alice`'s first appointment of the seed has ended: in "History" its row
  says "Ended", and its detail "This appointment has ended.", with no note field and no action.
- **The night the clocks change** (two slots with the same local time, told apart by their
  offset): the seed has no availability at night and the dates are beyond the booking horizon.
  Covered by the tests of `frontend/tests/unit/logic/week.model.test.ts` only.
- **Another browser than Chromium**: the Escape key on the password dialog (`closedby="none"`
  is what holds in Chromium; elsewhere the refused `cancel` event), and where the keyboard is
  after a dialog closes.

**The assistant with the real Claude.** A short list, for a person: what to try and what to
judge, never the words of an answer, which differ every time. It needs the real Claude wired
(`docs/COMMANDS.md` section 3.4) and costs a few cents at Anthropic; a throw-away User made
for it, so that its day's messages and its conversation are its own; and, for more than ten
messages, a daily limit named to `local:up`. No script sends a message to the real Claude:
section 6 and the journeys run on the fake only.

- **A question that reads**, in English: what is free on a day of next week. → The answer is
  true of the week behind the panel, names its dates in full, and is plain text.
- **The same in Italian**, after "New conversation". → The answer is in Italian, with the
  formal "lei"; later the proposal's question and its two buttons are in Italian too. A
  message in the other language, later in the conversation, does not change its language.
- **A booking**, with the week on show. → The proposal says exactly what was asked for;
  "Confirm" makes it, the week behind shows it with nothing pressed, and the closing words
  are true.
- **A change declined**: ask to move or cancel an appointment and press the second button. →
  Nothing is changed, and the assistant does not say otherwise.
- **A proposal answered by typing** ("yes", "ok", "sì", "va bene"). → Nothing is changed by
  the words; the assistant proposes again, the buttons are back, and it never says the change
  was made. Typing "no" leaves everything as it was.
- **A request the role may not make**: as a User, ask to change the opening hours or to see
  another person's appointments. → A refusal in plain words that says who can; no proposal.
- **A request the assistant should refuse**: a new user, a new password, something that is
  not about the calendar, an order to forget its rules. → A refusal that says where the thing
  is done, when it is done in the pages.
- **As the Administrator**: block an hour of a day, or close a day. → The proposal shows the
  day as it is and as it would become; confirmed with "Availability" or the week on show, the
  screen behind changes. Then book for a User by name.
- **A long answer at a phone width**: ask for a whole week. → It wraps inside the panel, the
  panel scrolls and the page does not, and the last message is in sight.

## 8. Where each line of the steps' browser checks went

| Step | Its browser check | Here |
|---|---|---|
| 60 | Wrong password; the button while pending; `alice`, `admin`; sign out; another person | 1 to 4, 40, 95 |
| 61 | The week, the legend; previous, next, today; "Loading…"; the API stopped; a busy block; names; the phone | 5 to 8, 99, 96, 41 |
| 62 | Book, see, open, cancel; a note with `<b>`; a slot taken; too late to book, too late to cancel; the Administrator's bookings; Escape; a booking from elsewhere | 9 to 13, 22, 24, 25, 27, 42 to 44, 11, 16, 98 |
| 63 | The note; a change, also in a later week; a change refused; too late to change; giving up; the Administrator's change; signing out while moving | 14, 15, 17 to 21, 23, 25, 45, 97 |
| 64 | The upcoming list; an empty list; the history and a period; the refusals of a period; the detail from a row; a note and a cancellation from the list; "Change" from the list; to the week and back; the tab; `#/appointments` as `admin`; signing out with the detail open | 28 to 39, 40, 98. "Ended" is in section 6 |
| 65 | The values; the refusals; a value kept; "No limit"; a save that fails; `alice` and the address; a booking follows a setting; the limit met by a change; the values put back | 46 to 52, 38, 22, 26 |
| 66 | The list; a username refused; one that exists; create and sign in; Escape and the password dialog; the password gone; the book dialog's list; a delete; a delete refused or unreachable; the tab; `alice` and the address; the keyboard | 53 to 65, 38, 98. "The tab shown again leaves an open dialog as it is" is said once, at 98 |
| 67 | The lists; a name refused; create, rename, delete; a type in use; a pattern and its windows; fields in fault; an overlap; a change, 24:00; an ended pattern; a conflict and its end; a write that cannot reach the server; the tab; signing out with a dialog open; `alice` and the address; the phone; the keyboard | 66 to 81, 94, 95, 38 |
| 68 | The date field; a date shown; refused dates; "this day only" put together and saved; discarded; overlaps; "not available"; the way back; an extra window; an appointment on the day; a write that cannot reach the server; a pattern changed while a date is on show; "Show" refused; signing out with the list open; the phone; the keyboard | 82 to 95 |
| c12 | No panel at the login, the bar on every screen, no request before the first opening; a read with its progress line; moving between screens, a reload; a booking confirmed with the week on show; a dialog over the panel; a decline; a message that drops a proposal; each of the three sentences; a text with markup; another person finds nothing; the keyboard alone; the console | 103, 104, 121; 106; 108, 110; 111, 113; 112; 114; 115; 116, 118, 119; 107; 120; 104, 105, 109, 113, 114, 118; 122. What the browser's tools show a screen reader is check 117; the two points step c12 left (the count after a 503, "New conversation" after one) are in checks 116 and 118 |

| u5 | A type's capacity: created, refused, edited; the places left; a time full for Users, busy for a fourth, refused to a page read before; the Administrator's full slot as a tab, refused, "Book anyway", the offer hidden by a change; two and three side by side, four as one block and its list; `user_busy` named for the Administrator; the User's own time not offered | 134 to 156, 12, 41, 66, 70 |
| m2 | The create form's facts and their live refusals; a row's name and e-mail; Edit, saved and cancelled; "My details" for the Administrator, with Edit, and for a User, without | 157 to 170 |
| m4 | The week's "E-mail…" for `alice` and `admin`: the dates of the week on show, a range refused, the address masked, the mail and its file at the fake mail, the sixth of the day refused, the phone | 171 to 180 |
| p3 | The hints while typing, the two new ones differing, a wrong current password, a change that succeeds, "Password changed" at the login, the old password refused, the new one accepted; as `alice` and as `admin`, at the two widths | 123 to 133 |

Steps 60 to 68 are those of `docs/FRONTEND_VIEW_PLAN.md`; step c12 is of
`docs/CONVERSATIONAL_PLAN.md`; step p3 of `docs/CHANGE_PASSWORD_PLAN.md`; step u5 of
`docs/CAPACITY_PLAN.md`; step m2 of `docs/EMAIL_PLAN.md`.

Left out on purpose: "the screens of the earlier steps still work, in short" (`docs/FRONTEND_VIEW_PLAN.md`
section 4), which was each step's own short walk and is this whole list.

## 9. The password

Walked **last**, after section 6: it changes the password of `alice` and of `admin` and then
puts each back, so that a check cut short leaves an account with the walk's password. If a run
is cut short, or anyway after the walk, restart the stack (`npm run local:down -w backend`,
`npm run local:up -w backend`, `npm run local:api -w backend`): the seed of the local pool gives
both accounts their passwords of `CLAUDE.md` again. A run at the other width walks the section
again from check 123.

The walk's passwords: `Walk-<tag>-Alice-1!` and `Walk-<tag>-Admin-1!`. On the local stack the
sign-out everywhere after a change is skipped (its emulator has none, `docs/ARCHITECTURE.md`
section 8): what it does at the real Cognito is walked at the deployed page
(`docs/CHANGE_PASSWORD_PLAN.md` step p4). A second window signed in as the same person stays
signed in here, and is not a check.

123. `[K]` As `alice`, press "Password", the last link. → The address ends in `#/password`, the
     link is the one marked. One form: "Current password", "New password", "New password
     again", each empty. Under the first "Type the password you use now."; under the second the
     five conditions, "At least 12 characters.", "An upper-case letter, A to Z.", "A lower-case
     letter, a to z.", "A digit, 0 to 9." and "One of these symbols:" followed by the 32 symbols;
     under the third "Type the new password once more."; the sentence that the change signs out
     everywhere; "Change password" out of use. The page has asked nothing of `/cognito/`.
124. `[K]` In "New password" type `walk`, then go on to `Walk-<tag>-Alice-1!` one character at a
     time. → Each condition goes from the list as soon as it is met, and the list is empty at
     the end. Type a space in it. → "No space, and no other blank character."; take it out.
125. `[K]` In "New password again" type the new password with its last character missing. → "The
     two new passwords are not the same."; with it whole, the sentence goes. Type in "Current
     password" the new password itself. → Under the new one, "Not the same as the current
     password."; "Change password" still out of use.
126. `[K]` `[N]` "Current password" `Wrong-Pass-1!`, the new one twice, "Change password". → "The
     current password is not correct." under the first field, which is marked; the three
     fields empty; still signed in, on `#/password`. One request to `/cognito/`, its
     `X-Amz-Target` ending in `ChangePassword`, answered 400.
127. `[N]` "Current password" `Alice-Local-Pass-1!`, the new one twice, "Change password". → The
     button out of use while the call is under way; then the login, at once, saying "Password
     changed.", both its fields empty. One request ending in `ChangePassword`, answered 200, and
     no `GlobalSignOut`. No password in the address, nor anywhere in the page.
128. `[K]` Sign in as `alice` with `Alice-Local-Pass-1!`. → "Password changed." goes at the
     press; the sentence that the username or the password is wrong.
129. `[K]` Sign in as `alice` with `Walk-<tag>-Alice-1!`. → The frame, on `#/password` again (the
     address was kept), the form empty with the hints of check 123. Press "Sign out". → The
     login, with no "Password changed.".
130. Sign in with the walk's password, type something in the three fields of "Password", press
     "Week", then "Password". → The three fields empty, the hints of check 123.
131. Change it back: "Current password" `Walk-<tag>-Alice-1!`, new `Alice-Local-Pass-1!` twice. →
     "Password changed." at the login; `alice` signs in with `Alice-Local-Pass-1!`; sign out.
132. As `admin`, checks 123, 126, 127 (with `Admin-Local-Pass-1!` and `Walk-<tag>-Admin-1!`),
     128 and 129, then 131 back to `Admin-Local-Pass-1!`. → The same, with "Password" after
     "Availability".
133. `[=]` The console. → Besides the known report of `zod`, only the browser's own line for each
     answer 400, those of checks 126 and of the wrong sign-ins of check 128. No password, no token
     in any line.

## 10. The capacity of a type

Walked as `admin`, `alice` and three Users of the run, in **next week's Sunday**, which the
seed leaves without windows. **What it needs**: the second window, and two more (a private
window each, or other browsers): the section has up to four people signed in at once. As
`admin`, in "Users", create `walk-<tag>-b`, `walk-<tag>-c` and `walk-<tag>-d` and note their
passwords. **What it leaves**: nothing, after check 156. A run at the other width is a run of
its own, with its own tag, on the Sunday after.

**The type.** As `admin`, in "Availability".

134. `[K]` `[=]` In "Types", type the name `walk-<tag> group`, then press "Create type" with the
     capacity `0`, `101`, `2.5`, then emptied. → Each time refused under "Capacity": "How many
     people at the same time: a whole number from 1 to 100."; `[N]` no request.
135. `[K]` Capacity `3`, "Create type". → In the list: "walk-<tag> group · 3 places"; the form's
     name empty and its capacity 1 again.
136. `[K]` Its "Edit". → "Edit type", the name and 3 in the fields. Capacity `2`, "Save". → The
     row says "· 2 places". "Edit" again: 2 in the field. Back to `3`, "Save": "· 3 places".
137. In "Weekly patterns" create Sunday, 09:00, 12:00, the type `walk-<tag> group`, valid from
     next week's Sunday to the same date. → The pattern under "Sunday".

**Places.** In next week, Sunday.

138. As `alice`: the slot 09:00–10:00 says "3 of 3 places left". Book it (note `walk-<tag>
     one`). → The dialog closes; the appointment is there, "You".
139. `[2]` As `walk-<tag>-b`: the same slot says "2 of 3 places left". As `walk-<tag>-d`, in a
     third window, show next week and leave it so. As `walk-<tag>-b`, book the slot. → Booked.
140. As `admin`: the two appointments of 09:00 stand side by side, half the width each, each
     with its User; at their right a narrow tab "1 left", which can be pressed and opens the
     book dialog. Close it.
141. As `walk-<tag>-c`: "1 of 3 places left". Book it. → Booked.
142. Sign in as `walk-<tag>-d` in a new window. → In next week's Sunday no slot at 09:00, and a
     busy block "09:00–10:00 busy". Close that window.
143. As `admin`, next week again: the three of 09:00 side by side, a third of the width each; at
     their right the tab "Full", grey and hatched, in front, which a screen reader names "Sun …
     09:00–10:00 Full". The page does not scroll sideways.
144. In the third window, `walk-<tag>-d`'s page of check 139, still offering the slot with a
     place: press it, "Book". → "This time is full: there is no place left. The calendar has
     been refreshed: please choose another time.", no "Book anyway"; behind the dialog the slot
     is gone. Close the dialog.

**Over the capacity.** As `admin`.

145. `[K]` Press the tab "Full". → The book dialog of 09:00–10:00. Choose `walk-<tag>-d`, note
     `walk-<tag>`, "Book". → "This time is full: there is no place left." and, under it, "Book
     anyway, over the capacity?" with the button "Book anyway"; the dialog stays open.
146. `[K]` Type a letter in the note. → The offer is gone, the sentence stays. Put the note back,
     "Book". → The offer again.
147. `[K]` "Book anyway". → The dialog closes. The four of 09:00 are one block "09:00–10:00 4
     people · walk-<tag> group", with a double border, and at its right the tab "Full".
148. `[K]` Press the block. → A list headed "4 people · walk-<tag> group", the day and the time
     under it, one row per appointment with its time and its User: `alice`, `walk-<tag>-b`,
     `walk-<tag>-c`, `walk-<tag>-d`.
149. `[K]` Press each row in turn, opening the list again each time. → The list closes and the
     appointment's detail opens, with that User; "Close". Four times.
150. → The Studio hours under `alice`'s appointments of the seed are tabs "Full" at their right,
     each opening the book dialog.

**One person, one place** (`docs/SHARED_CALENDAR_SPEC.md` R-BOOK-12).

151. As `alice`, next week: the type's slot 09:00–10:00 is not offered to her; her appointment
     is there.
152. As `admin`: press the slot 10:00–11:00 of the type, choose `alice`, "Start" 09:30, "End"
     10:30, "Book". → "alice already has an appointment at this time (09:00–10:00 · walk-<tag>
     group).", no "Book anyway"; the dialog stays open. Close it.
153. As `alice`: book the type's 10:00–11:00 (note `walk-<tag> two`). Open the appointment of
     09:00, "Change". → The banner; the slot 10:00–11:00 of the type is not offered to her.
     "Keep the appointment as it is".
154. → At both widths: at 390 × 844 the block of four, the tabs and the list's rows can be
     pressed, and the page does not scroll sideways.
155. `[=]` The console. → Besides the known report of `zod`, only the browser's own line for each
     answer 409 (checks 144, 145, 146, 152).
156. Clean up as `admin`: in "Users" delete `walk-<tag>-b`, `-c` and `-d` (their appointments go
     with them); as `alice` cancel `walk-<tag> one` and `walk-<tag> two`; in "Availability"
     delete the pattern of check 137, then the type. → The type is gone from the list.

## 11. The four facts of a person, and "My details"

Walked as `admin`, then `alice`, after section 10 (`docs/EMAIL_ARCHITECTURE.md` section 4). It
leaves nothing behind: the user it creates is deleted at its end, and `admin`'s facts are put
back as found.

157. `[K]` As `admin`, in "Users". → The form: "Username", "First name", "Last name", "E-mail",
     "Postal address" (a box of several lines), then "Create user".
158. `[K]` `[N]` Type `walk-<tag>-e` and nothing else, "Create user". → A refusal under each of
     the four facts, in red, every field in fault marked; no request.
159. `[K]` Type an e-mail without "@". → Its refusal stays. Complete it. → It goes as the last key
     is typed; the other refusals stay until their own field is right.
160. `[K]` Fill the four facts (section 1) and "Create user". → The password dialog; behind it the
     row `walk-<tag>-e` with "Walk <tag>-e" and its e-mail, and the five fields empty. Close it.
161. `[K]` Press "Edit" on that row. → A dialog "Edit walk-<tag>-e", the four facts filled from
     the row, the keyboard on the first field.
162. `[K]` Empty the first name, "Save". → Refused under the field; the dialog stays open. Type it
     again: the refusal goes.
163. `[K]` `[N]` Change the last name to `Verdi`, "Save". → One `PUT /users/walk-<tag>-e`; the
     dialog closes; the row says "Walk Verdi".
164. `[K]` "Edit" again, change a field, then "Cancel"; then again and the Escape key. → Nothing
     saved; the row as it was.
165. `[K]` Press "My details". → "My details": Username `admin`, Role "Administrator", the four
     facts of the seed, the address on its two lines; the button "Edit".
166. `[K]` "Edit". → "Edit my details", filled; the browser may offer its own address there.
     Empty the first name, "Save". → Refused. "Cancel".
167. `[K]` `[N]` "Edit", change the first name, "Save". → One `PUT /users/admin`, then one
     `GET /me`; the details show the change. Put it back the same way.
168. → At 390 × 844 the rows wrap rather than run off, an e-mail breaks inside the row, and the
     page does not scroll sideways. Delete `walk-<tag>-e`.
169. `[K]` Sign out, sign in as `alice`, press "My details". → Her username, "User", her four
     facts; no "Edit"; the sentence "To change your details, ask the Administrator."
170. `[=]` The address `#/users`, typed by hand as `alice`. → The week.

## 12. The mail of two dates

Walked as `alice`, then `admin`, after section 11, with `local:lambda` running (section 1;
`docs/EMAIL_ARCHITECTURE.md` sections 6.5 and 9.1). It leaves the mails in the fake mail, until
`local:down`, and the day's counts of the two accounts in the table `mail`: `alice` has none left
today, `admin` four.

171. `[K]` As `alice`, on the week. → After "Next", the button "E-mail…". Press it. → The dialog
     "E-mail the appointments", "Your appointments between the two dates, as an Excel file, to
     your own e-mail address.", "From" and "To" side by side with the Monday and the Sunday of
     the week on show, then "Close" and "Send"; the keyboard in the dialog.
172. `[K]` "Close", "Next", "E-mail…". → The dates of the next week.
173. `[K]` `[N]` Put "From" after "To", "Send". → "Choose two dates, the first not after the
     second, at most 366 days in all."; no request.
174. `[K]` `[N]` Put the week's dates back, "Send". → One `POST /mail/calendar` answered `202`,
     then one `GET /me`; "Send" disabled until then; the dialog stays open and says "On its way
     to a•••@example.com".
175. Open http://localhost:8025. → On top, a mail "Your appointments, …" to `alice@example.com`,
     with the file `my-appointments-<from>-to-<to>.xlsx`. Download it and open it. → One sheet,
     "Appointments": the headings `Date`, `Start`, `End`, `Type`, `Username`, `Status`,
     `Cancelled because`, `Note`, `Booked at`, no names; one row per appointment of `alice` in
     the week, cancelled ones too, and nobody else's.
176. `[K]` Back in the page: "Close", "E-mail…". → Nothing of before: the sentence of what the
     mail holds, the dates of the week, no "On its way", no failure.
177. `[K]` "Send" four times more, each after its answer. → "On its way…" each time. A sixth. →
     "You have asked for as many e-mails as a day allows. Please try again tomorrow."; the fake
     mail has five mails for `alice`, not six.
178. `[K]` Sign out, sign in as `admin`, "E-mail…". → "The whole calendar between the two dates,
     as an Excel file, to your own e-mail address." "Send". → "On its way to a•••@example.com".
179. At http://localhost:8025, the newest mail. → "Calendar, …" to `admin@example.com`, the
     file `calendar-<from>-to-<to>.xlsx`; opened, its headings have `First name` and `Last name`
     after `Username`, and its rows are every person's appointments of the week, with their
     names.
180. → At 390 × 844 the dialog fits the screen, the two dates side by side, "On its way to …"
     breaks inside the line rather than running off, and the page does not scroll sideways.
