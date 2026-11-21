# Front end — The walk

| | |
|---|---|
| Status | v1 (2026-11-20, `docs/FRONTEND_VIEW_PLAN.md` step 69, brief `prompts/92-step-69-implementation.md`). Run twice on that day in headless Chromium 159, at a desktop width and at a phone width, on a fresh, seeded local stack: every check answered yes at both |
| What it is | One list of checks that walks every screen of the front end in a browser, as a User and as the Administrator, against the local stack. **The check to repeat after a later change to the view layer** |
| What it is not | A source of truth, and not an automated test. On any conflict `docs/FRONTEND_ARCHITECTURE.md` and the tests win, and this page is fixed. No end-to-end test tool is in the repository (`docs/FRONTEND_VIEW_PLAN.md` section 8, decision 6): a person follows the list by hand, or drives a browser with a script kept outside the repository |
| Made from | The browser checks of `docs/FRONTEND_VIEW_PLAN.md` steps 60 to 68, in the order a person would follow, and `docs/SHARED_CALENDAR_SPEC.md` section 16.8 |

### Change log

| Version | Date | Change |
|---|---|---|
| v1 | 2026-11-20 | First version: 102 checks. |
| v2 | 2026-11-21 | `docs/FRONTEND_DEPLOY_PLAN.md` step 71: "Sign out" also tells Cognito. Check 4 now looks at that request too (mark `[N]`); 102 checks still. Check 4 was done in that step's browser check, by a script; the walk was not run again in full. |

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
- **Two dates.** *The walk's date*: the first Wednesday that is at least 35 days after today
  (the seed gives it Studio 09:00 to 13:00, and a booking so far ahead is still allowed). *Next
  week*: the week after the one of today, where the seed leaves free slots on every weekday.

**What it changes, and what it leaves.**

- It changes **none of the seed's** types, patterns or appointments: it books, moves and cancels
  appointments of its own, and creates and deletes a type, patterns, a date's windows and users
  of its own.
- It writes the settings back as it found them (note the four values before check 20).
- **What stays in the local table as history**: the appointments the walk cancelled or moved,
  their events, and the deleted-user markers of the users it deleted. Appointments cannot be
  deleted through the API.
- If a run is cut short: sign in as `admin` and remove what carries the run's tag, in this
  order: the appointments (cancel them in the week), the windows of the walk's date ("Back to the
  weekly patterns", the extra windows), the patterns of the type `walk-<tag>`, the type, the
  users `walk-<tag>…`; then put the settings back.

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
3. `[K]` → The frame: the header says `alice` and "User"; the navigation holds "Week" and "My
   appointments" and nothing else; the address ends in `#/week`.
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
    press that slot, still shown as free, and "Book". → The booking is refused in plain words
    ("This time has just been taken. The calendar has been refreshed…"), the dialog stays open, and behind it the week is read again: the
    slot is gone and the appointment is there. Close the dialog. In the second window, cancel
    that appointment.

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
    "Settings", "Users" and "Availability", and no "My appointments". `[=]` The address
    `#/appointments`, typed by hand, shows the week.

**The week.** In next week.

41. → Every appointment carries its User's name: `alice`'s say "alice", none says "You".
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
    "Delete"; one request, `GET /users`.
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
    "Rename" and "Delete". "Weekly patterns": the seed's eight, under "Monday" to "Saturday",
    each with its hours ("09:00 – 13:00"), its type and its validity with the year. Three
    requests: the settings, the types, the patterns.
67. `[K]` `[=]` In "Types" press "Create type" with an empty name, then with a name of 41
    letters. → Refused under the field, in the words of the hint; `[N]` no request.
68. `[K]` Type `studio`, "Create type". → The server's refusal in plain words: a type with this
    name exists already.
69. `[K]` Create the type `walk-<tag>`. → It is in the list, and the field is empty again.
70. `[K]` Press its "Rename". → A dialog with the name in its field, the keyboard there. Change
    it to `walk-<tag> two`, "Rename". → The dialog closes; the list has the new name.
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
90. `[K]` `[N]` Press "Save this day". → One request. The box closes; "As it is now" says "This
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
    real switch is in section 6.) Cancel the two appointments of checks 97 and 98.
99. Go offline and press "›". → A failure in plain words above the week; the week that was on
    screen is still there. Go online, "Today". → The failure goes.
100. Type the address `#/nonsense` by hand. → The week, and the address becomes `#/week`; the
     browser's back button does not come back to `#/nonsense`.
101. Reload the page. → The login: a reload signs out (`docs/FRONTEND_ARCHITECTURE.md` section
     10, open point O3).
102. As `admin`, in "Users", `[K]` delete `walk-<tag>` (and any other user of the run). → Gone;
     its appointment of Wednesday is gone from the week. The users, the types, the patterns and
     the settings are those the walk found.

## 6. What only a person, a real browser or time can check

The run of a script in a headless browser cannot say these; they are for a person.

- **A real switch of tab**: check 98 with a real second tab, and the week read again on coming
  back.
- **A real phone**: the touch on a slot, the sideways scroll of the days with a finger, the
  on-screen keyboard over a dialog, the native lists.
- **A screen reader's voice**: that a failure is spoken when it appears, that a field in fault
  is said to be so, that the dialog that confirms speaks its question when it opens, that a
  slot is named with its day, and that a row's button says which row it is of.
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

## 7. Where each line of the steps' browser checks went

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

Left out on purpose: "the screens of the earlier steps still work, in short" (`docs/FRONTEND_VIEW_PLAN.md`
section 4), which was each step's own short walk and is this whole list.
