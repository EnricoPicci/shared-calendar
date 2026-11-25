## Brief

Implement plan step m6, "The assistant's tool `send_calendar_mail`" (`docs/EMAIL_PLAN.md`).
Follow CLAUDE.md's working rhythm: the step, its check, an honest report, then stop for review.

After this step, locally: a person writes to the assistant "e-mail me my appointments of next
week" (or, in Italian, "mandami per e-mail…"). Claude does not send anything. It proposes the
mail, and the server words the proposal in the conversation's language, with the masked address:
"Send your appointments from Monday 30 November to Sunday 6 December 2026 to a•••@example.com?"
(the Administrator: "Send the calendar from … to … to …?"). The proposal has **Confirm** and
**Don't**. On Confirm, `confirmProposal` runs the handler of `POST /mail/calendar` with the
person's identity, exactly as the week's "E-mail…" does; the mail arrives at the fake mail. A
person without an address, or a stack where e-mail is not on, is told so at the proposal, before
any button. The paid evaluation with the real model is run once, at the end. Nothing is deployed.

Read these in full first:
- `CLAUDE.md`, in particular:
  - "Working rhythm" (**the closing message is short**);
  - "Hard rules from the design" (**the rule on `confirmProposal`, which this step widens**; the
    logging rule, which covers the texts of a conversation; one role per function, no wildcard);
  - "Cloud safety" (`npm run assistant-key` is never run), "Comments", "Tooling and style";
  - "Changing these files" (**the file is at 199 of its 200 lines**).

  Then `backend/CLAUDE.md` (the section `src/assistant/`: "A change tool" and the lint rules on
  imports; 197 lines), `shared/CLAUDE.md` and `frontend/CLAUDE.md`. The rules of
  `.claude/rules/` load when a file of their paths is read.
- `docs/EMAIL_PLAN.md`:
  - sections 1 to 4: F5 (the address read at the proposal, `AdminGetUser` for the two functions
    that make proposals, the paid evaluation) shapes this step; read row m6 of section 4;
  - section 5.1 (the short check);
  - **step m6**, and the "As done" note of step m5 (what this step finds ready);
  - steps m7 and m8, to see what this step must not take from them.
- `docs/EMAIL_ARCHITECTURE.md`: sections 6.1 and 6.5 (the mail on demand and its five a day), **7
  (the assistant)**, 9.1, 12.2 (the roles), 12.4 (the logs), 13.2 (the stages), 17 (the row of
  the root rule).
- `docs/CONVERSATIONAL_ARCHITECTURE.md`, all of it. For this step above all: sections 3 (what the
  assistant can do, by role), 4.3 (the mark of the instructions), 5.5 (the proposal and its
  rules), 7.3 (the instructions), 8 (the tools: 8.2, a change tool), 10 (security), 12.2 and
  **12.3 (the evaluation; the last paid run's date, result and cost)**, 13 (the panel).
- `docs/ARCHITECTURE.md` sections 4 ("The mail of a range of dates", "The assistant's routes"),
  7.1 (the roles of the assistant's functions and of `sendCalendarMail`), 11.
- `docs/COMMANDS.md` sections 3.4 (the fake Claude, a real key for the evaluation), 3.5 and 4
  (`assistant:eval`).
- The code:
  - `backend/src/assistant/`: `tools/tool.ts`, `list.ts`, `changeHandlers.ts`, `run.ts`,
    `result.ts`, `event.ts`, `facts.ts`; one read-through-a-route change tool as the model,
    `tools/cancelAppointment.ts` (its `confirmation.read` through the list's handler); `prompt.ts`
    (`INSTRUCTIONS`, `promptVersion`), `proposal.ts`, `confirm.ts`;
  - `shared/src/assistant/` (`texts.en.ts`, `texts.it.ts`, `texts.ts`, `schemas.ts`) and
    `shared/src/mail/` (`MailCalendarBody`, `MAIL_LIMITS`, `maskAddress`);
  - the handlers `sendCalendarMail.ts`, `getMe.ts`, `confirmProposal.ts`,
    `sendAssistantMessage.ts`, `continueAssistant.ts`;
  - `backend/template.yaml` (the six assistant functions and their roles, `SendCalendarMailFunction`
    and its role, the mailer), `backend/scripts/local-seed.sh` (the assistant functions'
    sections);
  - `backend/tests/integration/assistant.test.ts`, `setup.ts`, `fake-claude/answers.json`,
    `backend/docker/fake-claude.mjs`;
  - `backend/tests/eval/` (`requests.ts`, `checks.ts`, `run.ts`, `cost.ts`);
  - `eslint.config.js` (the rules on imports under `src/assistant`);
  - the tests of all of these.

## Where we are (2026-11-25)

- Steps m1 to m5 are committed (`2bd1c65`, `c20649e`, `5fe43bf`), not pushed.
- `POST /mail/calendar` works locally for both roles: it checks the role, the stage, the body,
  the account and its address, counts five a day per person, then starts the mailer in the
  background and answers `202 { status: "queued" }`. `GET /me` answers the person's facts.
- The assistant has fifteen change tools, none about mail. Its paid evaluation last passed 57 of
  57 for about 45 US cents (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 12.3).
- The branch `slot-5min` (5-minute time steps) adds two evaluation requests of its own and will
  be merged into `main` after its own release. It is not part of this step.

## Decided already (the Product Owner)

Everything in `docs/EMAIL_ARCHITECTURE.md` (its decisions, open points and section 22) and in
`docs/EMAIL_PLAN.md` (sections 2 and 3, F1 to F15). Above all: the tool is a change tool for both
roles; it acts only through the route's handler and only after the person's button (decision
M9); its proposal reads the address through the handler of `GET /me` (F5). Apply them. If the
code proves one wrong, stop and tell me before going on.

## Decided for this step (the Product Owner, 2026-11-25)

1. **The paid evaluation runs in this step, on `main` as it is**, with the mail requests added.
   It does not wait for the merge of `slot-5min`.
2. **A stage that is not `on` is refused at the proposal.** The tool's `confirmation.read` looks
   at `MAIL_STAGE` before it reads anything. Any value but `on` ends the read with
   `mail_unavailable` and a sentence for Claude ("e-mail is not available yet"), and nothing is
   proposed. So the two functions that make proposals, `sendAssistantMessage` and
   `continueAssistant`, get `MAIL_STAGE` in their environment. The route's own check at Confirm
   stays as it is. A missing address is refused the same way (`no_email_address`, F5).
3. **The root rule is widened as `docs/EMAIL_ARCHITECTURE.md` section 17 says**: "The assistant
   changes the calendar, or sends a mail, only through `confirmProposal`, …". This wording is
   decided: make it in this step, keep the root `CLAUDE.md` under 200 lines, and say in the
   report what changed. Any other line of the root `CLAUDE.md` is still a pause.
4. **The five a day are told after Confirm.** The proposal does not look at the day's count: the
   route counts at Confirm, a sixth is refused there (`mail_limit_reached`), and Claude says the
   day's mails are used up. The proposal functions get no right on the table `mail`.
5. **Several periods asked at once become one mail over the whole span.** Asked for "this week
   and next week", or for two periods with a gap ("the first week of December and the first week
   of January"), Claude proposes one mail from the first day to the last; with a gap, the gap's
   appointments are in the file too, and the proposal shows the real dates before Confirm. The
   tool's description tells Claude so. A span over `MAIL_LIMITS.rangeDays` is refused by the
   schema, and Claude asks the person for a shorter one. Two mail proposals never share one
   answer of Claude (the tool's `subjects`). No change to the route or the mailer.
6. **One evaluation request confirms.** Exactly one of the new mail requests goes on to Confirm
   and checks that the mail was queued; the others end at the proposal.

## The step

As step m6 of the plan lists, with these points made precise:

1. **The tool** `backend/src/assistant/tools/sendCalendarMail.ts`, `send_calendar_mail`:
   - a change tool, offered to both roles. Its input is `from` and `to`, two local dates,
     checked with the shared `MailCalendarBody` (`from` not after `to`, at most
     `MAIL_LIMITS.rangeDays`). Its description tells Claude what the mail holds for each role
     and that it goes only to the person's own address. No address is ever an input;
   - `confirmation.read`, in this order:
     1. the stage (decision 2);
     2. the person's facts through the handler of `GET /me`: no address is
        `no_email_address`, an account gone is `user_not_found`;
     3. then the proposal: the call `POST /mail/calendar` with `{ from, to }`, and the facts the
        proposal shows (the two dates, the role's kind of mail, the address masked with
        `maskAddress`);
   - `summary` from `shared/src/assistant/`, in English and Italian, one sentence for each role,
     as in `docs/EMAIL_ARCHITECTURE.md` section 7. Dates are worded as the other summaries word
     them;
   - `toModel`: Claude gets only the outcome ("on its way", or the route's error code and its
     sentence); never the address, masked or not;
   - one line in `list.ts`, one in `changeHandlers.ts` to the handler of `POST /mail/calendar`.

   One mail over the whole span, one per answer (decision 5); the five a day are told after Confirm (decision 4).
2. **The instructions**: change `INSTRUCTIONS` only if a request of the evaluation shows the
   need, and say which. The mark of the instructions changes anyway (a new tool), which ends the
   conversations in progress at the deploy: say so in the documents.
3. **`backend/template.yaml`**, the least each role needs:
   - `ConfirmProposalFunction`: what the handler of `POST /mail/calendar` needs (the mailer's
     invoke on the mailer alone, `AdminGetUser`, `UpdateItem` on the table `mail`) with its
     variables (`MAIL_STAGE`, `MAIL_TABLE`, `MAILER_FUNCTION`, `LAMBDA_ENDPOINT` declared empty);
   - `SendAssistantMessageFunction` and `ContinueAssistantFunction`: `AdminGetUser` on the pool
     (F5) and `MAIL_STAGE` (decision 2).

   Explain each new permission in plain words in the report. `scripts/local-seed.sh`: only what
   the local stack needs for these, if anything (`docs/COMMANDS.md` section 3.2 says when a
   function needs its own section).
4. **The fake Claude**: answers in `backend/tests/integration/fake-claude/answers.json` for the
   journey's sentences, asking for the tool.
5. **Journeys**: in `backend/tests/integration/assistant.test.ts`, a block of its own, with a
   throw-away User made for the run (a new `sub`, so all of the day's five), removed before and
   after, as the other blocks do. It checks that:
   - the proposal shows the dates and the masked address, and nothing is sent before the button;
   - Confirm answers "on its way", and one mail comes to the User's own address at the fake
     mail, read back and forgotten by that address only;
   - Don't sends nothing;
   - an account without an address (a second administrator made without facts, as in the mail
     route's block) is told `no_email_address` at the proposal, and nothing is proposed.

   The stage refusal cannot be seen locally (the stage is `on`): it is a unit test. Its page
   under `docs/journeys/backend/`, with the project skill `explain-journey`. No existing journey's
   story changes; if one would, pause.
6. **The page**: the panel shows proposals as it does today. Change it only if the mail's
   proposal or its outcome needs it, and say so. If the panel's walk gains a mail proposal,
   `docs/FRONTEND_WALK.md` gains its check.
7. **The evaluation** (`backend/tests/eval/requests.ts`): requests for a mail, in both languages
   and for each role, at least four. They end at the proposal and check the tool and the two
   dates; exactly one goes on to Confirm (decision 6), which sends one mail to the fake mail and
   counts one of that account's five. Two requests ask for two periods at once, one
   pair side by side and one with a gap, in different languages, and check that one mail is
   proposed, from the first day to the last (decision 5). Run the free checks first (the unit tests of the list, `--list`).
8. **The documents** of section 4's row m6:
   - the root `CLAUDE.md` rule (decision 3);
   - `docs/CONVERSATIONAL_ARCHITECTURE.md`: the tool in sections 3 and 8, the proposal in 5.5
     if a rule is touched, the instructions in 7.3 if changed, 12.3 (the requests added, the
     run's date, result and cost), its version row;
   - `docs/ARCHITECTURE.md` (section 4, "The assistant's routes" and "The mail of a range of
     dates"; 7.1, the roles; the v16 row);
   - `docs/EMAIL_ARCHITECTURE.md` section 7 (decision 2) and 12.2;
   - `backend/CLAUDE.md` if its section `src/assistant/` needs a line (it is at 197).

Not in this step:
- the first sign-in (step m7);
- the invitation, the stages' conditions, the SES resources, SNS for bounces (step m8);
- the merge of `slot-5min`;
- the smoke test, `npm run assistant-key`, any `aws` command, the cloud.

## How we work in this step

- **Messages to me are short.** At the end and at each pause: one or two simple sentences on
  what was done, then plainly what I must decide or do. Questions one at a time, in simple words.
- **The pauses**:
  - code proving `docs/EMAIL_ARCHITECTURE.md` section 7 or `docs/CONVERSATIONAL_ARCHITECTURE.md`
    wrong;
  - an existing journey whose story would change;
  - any line of the root `CLAUDE.md` beyond decision 3;
  - a change to `INSTRUCTIONS` beyond what a failed evaluation request shows;
  - a new dependency;
  - **before the paid run** (below).
- **Ask me before you stop or restart the local stack** (`local:up`, `local:down`, `local:api`,
  `local:lambda`): I run them in my own terminals. After `npm run build -w backend` they need a
  restart; tell me, and wait for my go-ahead.
- **The paid run, once.** When the free checks and the journeys are green, stop and tell me the
  expected cost (the last run cost about 45 US cents; with the mail requests about 50 are
  expected). I start the local stack with the real Anthropic key in my own terminal and tell you.
  Then run, with `--ceiling 1` (US$1):
  `DYNAMODB_PORT=8002 npm run assistant:eval -w backend -- --ceiling 1 --out <scratchpad>/run.json --hand <scratchpad>/answers.txt`.
  Report each request's pass or fail, the hand-read answers that matter, and the cost. A failed
  request is reported and its cause proposed; the run is **not** repeated without asking me (a
  second run is a second cost). Afterwards I put the fake Claude back.
- Every comment follows `.claude/rules/comments.md`: plain words on what the code does or why,
  each reference with the document's path in the same sentence, no step or brief numbers.
- Logs: no text of the conversation, no address, masked or not.
- Do not run the back end's and the front end's integration tests at the same time.
- Commit only when asked. Do not push. Do not start step m7.

## Acceptance (`docs/EMAIL_PLAN.md` step m6, section 5.1)

- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root, with 100 % line
  coverage kept (`backend/src/assistant` included).
- With `local:up`, `local:api` and `local:lambda` running on the fake Claude, the new block of
  `assistant.test.ts` alone green, and any journey file this step changes. Not `npm run verify`,
  not the whole walk, not the smoke test.
- The paid evaluation run once, under US$1: each request's result and the cost said.
- A look in the browser at the panel: one mail proposal shown with the masked address,
  confirmed, and its mail at `http://localhost:8025`.
- `git status` shows changes under `shared/`, `backend/`, `frontend/` (only if the panel
  changed), `docs/`, the `CLAUDE.md` files and the root `package-lock.json` only.
- In `docs/EMAIL_PLAN.md`, an "As done" note under step m6. It says:
  - each existing test or journey changed, and why;
  - each permission added, and to which role;
  - each evaluation request added and its result, the run's cost;
  - whether `INSTRUCTIONS` changed, and why;
  - what changed in the `CLAUDE.md` files.

  It ends with what step m7 finds ready. Update the plan's version line too.

Then give the short closing message, and suggest the commit.
