Design, and plan the implementation of, support for more than one calendar.

Today the application has one calendar. The change:

- There can be several calendars.
- Each calendar is owned by an administrator, and an administrator sees and manages only their
  own calendars.
- A super-user sees every calendar and has every power: all that an administrator has over any
  calendar, and the powers over calendars and administrators that no administrator has.

This worktree (branch `multi-calendar`) is for design and planning only. No code is written, in
`backend/`, `frontend/` or `shared/`, no script, no template, no test. The branch must merge into
`main` without conflict whenever it is merged, because the e-mail work (`docs/EMAIL_ARCHITECTURE.md`,
`docs/EMAIL_PLAN.md`) is being built on `main` at the same time and rewrites the same user and
role model.

Rules for the documents:

- New files only: `docs/MULTI_CALENDAR_ARCHITECTURE.md` for the design (behaviour, the API
  contract, the data model, the security rules, in the shape of `docs/EMAIL_ARCHITECTURE.md`),
  `docs/MULTI_CALENDAR_PLAN.md` for the plan (steps with an acceptance check each, in the shape of
  `docs/EMAIL_PLAN.md`), and the briefs in `prompts/`, numbered in sequence (`cal-c02-...`).
- Do not edit `docs/ARCHITECTURE.md`, `docs/SHARED_CALENDAR_SPEC.md`, `docs/FRONTEND_*.md`, the
  CLAUDE.md files, `README.md` or any other existing document. The design says, section by
  section, what it will change in each of them, and the plan's first step makes those changes
  when the build starts.
- Before each session, merge `main` into the branch and design against what `main` holds then
  (the e-mail work changes the facts held per person, `GET /me`, the invitation and the
  stages). Say in the design which of its points depend on the e-mail work being released first.
- The build of this change starts only after the e-mail release (v3.0.0); the plan says so.
- `npm run lint` must stay green (`scripts/doc-references.mjs` checks every reference to a
  document); no other command is needed.

Read first: `docs/ARCHITECTURE.md`, `docs/SHARED_CALENDAR_SPEC.md`, `docs/EMAIL_ARCHITECTURE.md`,
`docs/CAPACITY_PLAN.md` (the last change of the calendar's model, as an example of a plan), and
the root CLAUDE.md, whose hard rules (roles, the API never creating an administrator, one IAM
role per function) this change touches.

Points to settle with me, one question at a time where the documents do not decide them:

- The super-user: a new Cognito group, and how it fits the rule "`admin` wins over `user`"
  (a new order of the groups, and what a token in none of them gets). How the first one is
  made (the bootstrap script of `docs/RUNBOOK.md`), and whether there can be several.
- The hard rule "the API can never create an administrator, delete one, or set its password":
  who creates an administrator now, and how. Keep the rule's reason in mind (an account that
  can do everything is not made through the API), and propose what replaces it.
- A calendar: who creates and deletes one; whether it has one owner or several; what happens to
  its appointments, its types, its patterns and its Users when it is deleted or changes owner.
- A User: whether they belong to one calendar or to several, who creates and deletes them, and
  what an administrator sees of the Users of another calendar (nothing).
- The existing data: the one calendar of today becomes the first calendar, with its owner the
  existing administrator. What changes in the keys of the `calendar` table, and whether a
  migration is needed (the design may name the migration; it does not write it).
- The API: how a route names its calendar (in the path, or from the token), what a person gets
  for a calendar that is not theirs (`403` or `404`, with the reason: whether the answer reveals
  that the calendar exists), and the contract changes that break a client (the release version,
  `README.md` section "Versions").
- The rest of the system, one answer each: the assistant (the calendar it works on, its tools,
  its evaluation), the mailer and the daily mail (one per calendar, to whom), the settings (the
  booking rules per calendar or global), the Administrator's and the User's screens (choosing a
  calendar), the authorizer and the IAM policies (still no wildcard), the logs.
- Privacy between administrators: the rule that one administrator can never read another's
  calendar, and the tests that would prove it (a journey with two administrators).

Ask any questions you may have to clarify this task. Start working only when everything is
clear. The result is the architecture proposal first, for my review and no plan yet; the plan
comes after I agree the architecture.
