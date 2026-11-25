Plan the implementation of e-mail, as designed in `docs/EMAIL_ARCHITECTURE.md`.

Write the plan as `docs/EMAIL_PLAN.md`, in the manner of `docs/CAPACITY_PLAN.md` and
`docs/CONVERSATIONAL_PLAN.md`: a version line, the brief, the documents that govern it, what is
asked and the shape of the answer, what planning found, then one section per step with what it
builds, what it does not, and its acceptance check.

What to read first:

- `docs/EMAIL_ARCHITECTURE.md`, whole. It is the design, and every decision in it is settled
  with the Product Owner (sections 2.2, 2.3 and 21): do not reopen them. Its section 20 is the
  outline of the steps; refine it, do not replace it without saying why.
- `docs/ARCHITECTURE.md`, and the parts of `docs/SHARED_CALENDAR_SPEC.md`,
  `docs/CONVERSATIONAL_ARCHITECTURE.md`, `docs/FRONTEND_SERVICES.md` and
  `docs/FRONTEND_ARCHITECTURE.md` that `docs/EMAIL_ARCHITECTURE.md` names.
- The code it touches: `backend/src/handlers/createUser.ts`, `backend/src/lib/cognito.ts`,
  `backend/template.yaml` (the user pool, a function with its role), `backend/scripts/`
  (`local-seed.sh`, `bootstrap-admin.sh`, `smoke.sh`), `backend/docker/` (the fake Claude, the
  model for the fake mail), `backend/src/assistant/tools/` (a change tool),
  `frontend/src/services/cognito.ts` and `login.service.ts`, the users, week and settings
  screens.
- `prompts/mail-m01-conversation.md`, for how the design was reached.

What the plan must say:

- **Step 0 deletes the existing Users** in the cloud (`docs/EMAIL_ARCHITECTURE.md` section
  4.3), done by the operator through the Users page before any code. Say what it cancels, and
  that the local seed creates `alice` with the four facts from then on.
- **When each governing document changes.** `docs/EMAIL_ARCHITECTURE.md` governs until it is
  merged into `docs/ARCHITECTURE.md` and the front end's documents, as was done for the
  assistant; section 17 lists what changes. In particular the root `CLAUDE.md`'s hard rules
  ("no forced password change and no e-mail sending") and its logging rule must change in the
  same step as the first code that breaks them, not later.
- **Nothing reaches the cloud before step 9.** Mark each step that needs the operator (DNS,
  SES production access, the SNS confirmation, deploys) and what they do, in plain words.
- **What the first steps must confirm**, which `docs/EMAIL_ARCHITECTURE.md` section 22 lists as
  not confirmed yet: that pointing the existing user pool at SES is an update without
  replacement (a change set, no deploy), Cognito's invitation placeholders and template limit,
  the Excel library and the size it adds to the mailer, SES's prices.
- **A short acceptance check per step, to keep development fast.** Unlike the earlier plans,
  a step does not rerun the whole regression. Each step's check is only:
  - `npm run typecheck`, `npm run lint` and `npm run test:unit` (fast, no Docker; they keep the
    100 % line coverage that `CLAUDE.md` asks);
  - the integration journeys the step adds or changes, run alone (one test file, or one
    `describe` block), with their pages under `docs/journeys/`;
  - for a step that changes a screen, a look at that screen only, not the whole
    `docs/FRONTEND_WALK.md`.

  The full regression (`npm run verify` with every journey, the whole front-end walk, the
  smoke test) runs only where it cannot be skipped: **before the first cloud deploy** (the
  deploy gate, `scripts/deploy-gate.sh`, requires it and must not be bypassed) and **at the end
  of the last step**. Say in the plan which step runs it and what it covers.
- **The release**: v3.0.0, the API and the page together, since `POST /users` no longer
  answers a password.

What is not in this brief: no code, no change to any document but `docs/EMAIL_PLAN.md`, no
cloud command. If reading the code proves `docs/EMAIL_ARCHITECTURE.md` wrong or incomplete,
say so and propose the change to it; do not quietly plan around it.

Ask any questions you may have to clarify this task. Start working only when everything is
clear. Stop when the plan is written, for review; commit only when asked.
