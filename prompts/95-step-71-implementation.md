## Brief

Implement plan step 71, "Logout" (`docs/FRONTEND_DEPLOY_PLAN.md`), following CLAUDE.md's
working rhythm: one step, its acceptance check, an honest report, then stop for review.

**Two stops.** The step has two parts, and the first ends with a stop:

- **Part A, the design**: a new version of `docs/FRONTEND_SERVICES.md` with the service that
  signs out. No code. **Stop for my review.**
- **Part B, the code**: only after I have answered part A. One stop at its end.

The direction is decided (`docs/FRONTEND_ARCHITECTURE.md` section 13.7 and section 11,
decision 152): "Sign out" revokes the refresh token at Cognito (`RevokeToken`) and clears the
`SessionStore` **whatever Cognito answered**. Nine points under that direction were decided
with me before this brief was finished: they are in "Decided before the design" below. **One
of them changes the words of section 13.7**: the store is cleared *first* and Cognito is told
*after*, not the other way round; part B corrects that section and decision 152.

**This step touches no cloud resource**: no `sam deploy`, no `aws` command that creates,
changes or deletes anything, and no call to the real Cognito. It changes nothing in `backend/`,
in `shared/`, in `frontend/template.yaml` or in the deploy scripts. In `frontend/src/views/`
it changes the shell's "Sign out" and nothing else of a view.

Read these in full first:
- `CLAUDE.md`, in particular "Hard rules from the design" (nothing of a token in a log), the
  "Comments" section, the folder map's `frontend/` entry (the rules that are easy to break:
  tokens live only in the `SessionStore`; a view never sees a token) and "Test conventions"
  (the services' tests, the shell's test, the fake timers).
- `docs/FRONTEND_ARCHITECTURE.md`: section 13.7 (the direction) and 13.4 (the
  Content-Security-Policy: Cognito's address is already allowed); section 6 (the shell: point
  2 on "Sign out", what a session owns, what a teardown wipes); section 10, row O7; section
  11, decision 152.
- `docs/FRONTEND_SERVICES.md`: sections 2 and 3 (the rules and the pattern every service
  follows), 4.8 (the row "logout (not designed yet)"), 9 all of it (the `SessionStore`, its
  guarded writes, who writes), 10.1 (`cognito.ts`), 11 all of it (`RefreshService`: the
  nearest relative of this service, and the one whose timer and in-flight call a sign-out
  must not trip over), 14 (placement and the integration journeys), and section 8 (the
  decisions; the new ones continue its numbering).
- `docs/FRONTEND_DEPLOY_PLAN.md`: step 71, step 72 (what it expects of this step), section 4
  (the risk about cognito-local).
- `docs/ARCHITECTURE.md` section 7.3 (the access token's last minutes, already accepted for a
  deleted user).
- `docs/journeys/README.md` and the skill `.claude/skills/explain-journey/SKILL.md`, in case
  part B writes a journey.

Then read the code:
- `frontend/src/services/cognito.ts`, `session.store.ts`, `refresh.service.ts`,
  `refresh.types.ts`, `login.service.ts`, `login.types.ts`, and their unit tests.
- `frontend/src/views/shell.ts` (the handler of `.sign-out`, `sessionObjects`, the teardown)
  and `frontend/tests/unit/views/shell.test.ts` (the tests of a sign-out and of a second
  person).
- `frontend/tests/integration/local.ts`, `login.service.test.ts` and `journeys.test.ts`.
- `backend/template.yaml`: the app client (`EnableTokenRevocation: true`, no client secret).
  Read only.

## Where we are (2026-11-21)

- Step 70 is done and committed (`0e695a7`): the hosting's template, the deploy command and
  the shared gate exist; nothing is deployed. Its dry run was run after the commit and
  passed: the gate, the front end's `verify`, the read of the back end's stack, the build.
  Check `git status -sb` and `git log` rather than trusting this line.
- **`docs/FRONTEND_DEPLOY_PLAN.md` v2 still says the dry run was not tried** (the note under
  step 70, point 1 of step 72, and `CLAUDE.md`'s line on step 70). Correct the three in part
  B's commit: it was run on 2026-11-21 on commit `0e695a7` and passed; step 72 runs it again
  anyway, as its first command.
- Today "Sign out" is one line of `frontend/src/views/shell.ts`: `store.clear()`. The refresh
  token stays valid at Cognito for up to its seven days.
- cognito-local lacks `AdminUserGlobalSignOut` (`CLAUDE.md`). Whether it has `RevokeToken`
  is not known: finding out is part of this step.
- Open from step 70, not this step's work: the page through the Codespace's forwarded port
  under the dev server's new policy. If I have not reported it by part B's browser check,
  remind me in the report.
- In the agent's non-interactive shell, run `source /usr/local/share/nvm/nvm.sh && nvm use` if
  `node -v` is not 22. The local DynamoDB has been on port 8000, not 8002: look at
  `docker ps` before passing `DYNAMODB_PORT`.
- This brief file is untracked when you read it; commit it with part B.

## Part A: the design

A new version of `docs/FRONTEND_SERVICES.md` (v8): a new section for the service, in the
shape of sections 11 to 13 (the remote call, configuration, types, the class, mapping the
answer, use from the view layer, security notes, unit tests, integration checks), the change
to section 10.1 (`cognito.ts` gains the call), the row of section 4.8, the rows of sections
9.4 and 9.5 that say "logout (later)", new decisions in section 8, the status line and the
change log. Written as the other sections are: what is, in plain words, with the code's shape
shown where the other sections show it.

Before writing, find out and say in the design, with the source:

1. **What `RevokeToken` is on the wire**, from AWS's API reference read now, not from memory:
   the target header, the body's fields for an app client without a secret, the success
   answer, the error names and their statuses (a token already revoked or expired, an unknown
   client, throttling, revocation not enabled for the client). Whether it needs an access
   token or AWS credentials (section 13.7 says neither: confirm it).
2. **Whether a browser may call it from another origin**: Cognito's CORS answer for this
   target, as known for `InitiateAuth` (`docs/FRONTEND_SERVICES.md` section 10.3). If the
   documentation does not say, say so: step 72 proves it.
3. **What revoking does and does not do**, in AWS's words: the refresh token and the tokens
   made from it; what the API's authorizer, which checks signature and expiry only, still
   accepts and for how long (`docs/ARCHITECTURE.md` section 7.3).
4. **Whether cognito-local implements `RevokeToken`**: try it against the local emulator
   (a sign-in as `alice`, the call, then a refresh with the revoked token) and report what
   each call answered. This is the one thing part A runs; it changes nothing but
   cognito-local's own state. If the call is missing, or answers 200 and the refresh still
   works, say which: the two mean different things for the tests.

### Decided before the design (2026-11-21)

The nine points below were put to me one by one and are decided. The design writes each as a
numbered decision of section 8, with its reason, and works out what is left open under it.
**If the code or AWS's documentation proves one of them wrong, stop and say so with a
proposal**; do not choose another answer silently.

1. **The shape: a full service.** A `LogoutService` in the pattern of section 3, with its own
   state and a result that says whether Cognito was told, and why not when it was not. No
   token in a result, a state or a field (rule 9; section 8, decision 28). Left to the
   design: the names of the states and of the result's cases.
2. **The order: forget first, tell Cognito after.** The service takes the refresh token from
   the store, clears the store at once, so the login shows immediately, and sends the
   revocation with that one copy, which is dropped when the call ends or is given up. A slow
   or dead network never keeps a person signed in. Left to the design: exactly how the token
   is read, held and dropped, so that no copy outlives the call and none is reachable from
   outside the service meanwhile.
3. **Who owns the call: the page, not the person.** One `LogoutService` for the whole page,
   like the `LoginService`; it is not among the objects `sessionObjects` makes and tears
   down, so the teardown of the person who left does not cancel the call. Its late answer
   changes nothing of the session.
4. **A renewal under way: its late answer is dropped.** A sign-out does not wait for a
   `RefreshService` call in flight: it revokes the token the store held at the press and
   clears the store; the store's guarded write (section 9.2) drops the renewal's answer, and
   the renewal's timer is disarmed by the `null`. Left to the design: to show with a test
   that nobody is signed in again, and to say what is true if that late answer carried a new
   refresh token (does Cognito hand one out on a refresh with this app client's settings? If
   it can, say what is then left valid at Cognito, and for how long).
5. **What the person sees: the login, and nothing else.** No message about the revocation,
   whether it worked or not. The failure is in the service's result, for a developer and for
   the tests; no view shows it.
6. **A time limit: the call is given up after about 10 seconds**, and the result then says
   that Cognito was not reached. Each press is a call of its own: a second person's sign-in
   and sign-out never wait for the first person's revocation and are never confused with it.
   Left to the design: the exact number, in line with what the other services do, and what
   two presses in a row do.
7. **The other ways a session ends do not revoke.** Expiry, a 401/403 from the API and a
   refresh refused clear the store as today (section 9.4) and send nothing. Only "Sign out"
   revokes. The design says why this is acceptable in each of the three cases.
8. **What is left behind: the login's last result is cleared.** The per-person services need
   no `reset()`: they are new for each person. At a sign-out the page-wide `LoginService` is
   put back to its first state, so that nothing of the person is left in a service either.
   The `LogoutService` keeps its own last result until the next sign-out; it names nobody.
   Left to the design: to check what the `LoginService`'s result and state hold today (I was
   told "the last login's outcome, never a token"; confirm it in the code), whether it has a
   `reset()` already or needs one, who calls it, and that the row of section 4.8 is rewritten
   to match.
9. **The proof: unit tests now, the cloud at step 72.** If cognito-local implements
   `RevokeToken` and a refresh with the revoked token is then refused: an integration journey
   with its page. If it lacks the call, or answers 200 and the refresh still works: no fake
   is built; the unit tests fix what is sent and that the store is cleared in every case,
   and the proof is one check by hand at the first deployment, written into step 72 of
   `docs/FRONTEND_DEPLOY_PLAN.md` in part B.

**The unit tests' cases**, which the design lists as sections 11.8 to 13.8 list theirs: at
least the answer 200, each failure, no answer and the time limit, the store cleared in every
case and before the call's answer, the token in no result and no log, a sign-out with no
session, two presses, a renewal in flight, the `LoginService` back in its first state.

The design changes no decision already taken. If it finds that the direction of section 13.7
cannot be built as written (for example: the call cannot be made from a browser), **stop and
say so with a proposal**, as step 70 did for the failures CloudFront keeps.

### Part A's report, then stop

What AWS's pages said on points 1 to 3, with their addresses; what cognito-local answered;
what the design worked out under each of the nine decisions, in one line each, with the
ones you were least sure of first, and any of the nine that the findings put in doubt; what part
B will build, file by file; anything in `docs/FRONTEND_ARCHITECTURE.md` section 13.7 or 6
that the design makes wrong. No code, no commit.

## Part B: the code

Only after my answer to part A, and as the reviewed design says. In this order:

1. `frontend/src/services/cognito.ts`: the call, with its unit tests.
2. The service and its types (`<name>.service.ts`, `<name>.types.ts`), with unit tests. The
   allowed imports do not change (`rxjs`, `rxjs/fetch`, `rxjs/operators`,
   `@shared-calendar/shared`).
3. `frontend/src/views/shell.ts`: "Sign out" uses the service. The shell's tests: the ones of
   a sign-out and of a second person stay green (nothing of the first person left in the
   page, in a field or in the address), plus what the design asks.
4. The integration check the design chose, and its page under `docs/journeys/frontend/` if it
   is a journey (the skill `explain-journey`; the `describe` gets its pointer comment).
5. The browser check, under `npm run dev -w frontend` against the local stack, in a headless
   browser as for the earlier steps:
   - sign in as `alice`, "Sign out": the login at once, both fields empty; nothing of the
     person in the page or the address; the network shows the revocation sent (to
     `/cognito/`, locally);
   - **with cognito-local stopped** (`docker stop` of its container, started again
     afterwards, and say so): sign in first, stop it, "Sign out": the login at once all the
     same;
   - sign in as `admin` straight after `alice`'s sign-out: the frame is `admin`'s;
   - the console: `zod`'s one report and no other; no token in it.
6. The documents, in the same change:
   - `docs/FRONTEND_SERVICES.md`: the design as built; "implemented" in the status line.
   - `docs/FRONTEND_ARCHITECTURE.md`: a new version; section 6, point 2; section 10, row O7
     closed; section 13.7 in the present tense of what is built; section 13.1's table if the
     local and the deployed page now differ in one more thing; decision 152.
   - `docs/FRONTEND_DEPLOY_PLAN.md`: step 71 done; the dry run's three lines corrected (see
     "Where we are"); what step 72 must now prove of logout, in words a person can follow
     at the deployed page.
   - `docs/FRONTEND_WALK.md`: check 4 and any other check of "Sign out" that now says more.
   - `docs/FOLDER_STRUCTURE.md` section 7 and `CLAUDE.md` (the folder map's list of services,
     the rules that are easy to break if one is new, "Where the truth lives").
   - `docs/journeys/README.md` and `docs/journeys/PLAN.md` if a page is added.

## How we work in this step

- No cloud. The real Cognito is not called: what only the cloud can prove is listed for
  step 72.
- No commit until I ask. Part A is not committed alone unless I say so.
- A token never appears in a log, in a test's printed output, in a result, a state or the
  console, nor in a command-line argument of a script used for the checks (`CLAUDE.md`).
  The refresh token in a unit test is a made-up text.
- When the code proves the reviewed design wrong, stop and propose the change to the
  document; do not write around it.
- The local stack may be up or not; `local:api` and the dev server are started when needed
  and stopped afterwards, and the report says so.
- Report honestly: what was tried and how, what was not tried and why, every failure.

## Acceptance (`docs/FRONTEND_DEPLOY_PLAN.md` step 71)

Part A: the design holds the nine decisions, each with its reason and with what was left to
it worked out; the four findings are reported with their sources; nothing but `docs/FRONTEND_SERVICES.md` changed.

Part B:
- `npm run verify -w frontend` green, coverage 100 % of `frontend/src`.
- Root `npm run verify` green (the integration tests included, with the new one if there is
  one).
- In a browser, against the local stack: "Sign out" shows the login at once, also with the
  local Cognito stopped; nothing of the person is left in the page or the address.
- No token in a log, a result, a state or the console.
- If cognito-local revokes: a refresh with the revoked token is refused, in the journey. If
  it does not: the report says so, and step 72's check of it is written in the plan.

## Report (part B)

What was built, file by file; the result of each acceptance check; every place where the
code differs from the reviewed design, and why; every decision this brief and the design do
not say; what step 72 will be the first to prove of logout.
