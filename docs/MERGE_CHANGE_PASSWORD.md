# The merge of `change-password` into `main`: plan and decisions

| | |
|---|---|
| Status | Done on 2026-11-23: the merge commit on the branch `merge-change-password` whose message begins "Merge branch 'change-password' into main", reviewed, then `main` moved to it (fast-forward) and pushed the same day. Nothing was deployed. The decisions of section 3 were taken by the Product Owner the same day, each as recommended |
| What it is | The steps that join the branch `change-password` to `main`, the decisions the Product Owner takes before they start, and how each conflict is to be resolved |
| What it is not | A source of truth. What the code and the page are is in the documents of `CLAUDE.md` ("Where the truth lives"); this page only says how two lines of work are joined |
| Model | `docs/MERGE_DEPLOY_FRONTEND.md`, the merge of `deploy-frontend`, whose strategy this one follows |
| Brief | `prompts/e04-merge-into-main.md` |

## 1. The two lines of work

Both lines start from `4979fd5` (`docs/CONVERSATIONAL_PLAN.md` step c11, `AssistantService`).

| Branch | Commits since `4979fd5` | What they did |
|---|---|---|
| `change-password` (local only, never pushed) | 2, 2026-11-22 | `docs/CHANGE_PASSWORD_PLAN.md` steps p1 and p2: the design (`docs/ARCHITECTURE.md` v14, section 6.9, a new hard rule in `CLAUDE.md`), the shared password rule `shared/src/password.ts`, `ChangePasswordService`, `cognito.ts` made general (`cognitoRequest`, `readCognitoBody`, `readCognitoError`), the journey `change-password.test.ts` and its page |
| `origin/main` | 16, 2026-11-21 to 2026-11-23 | The merge of `deploy-frontend` (`3070d5b`): the page's hosting, `LogoutService` with `RevokeToken`, the page deployed as `shared-calendar-web`, the old stack deleted, a custom domain; the assistant's panel (c12, c13); the assistant deployed to `shared-calendar-api` (c14, c15) |

What `main` brings that matters most here: **the page is now deployed**, and **logout exists**.
The branch was written when neither was true, and it says so in several places.

## 2. What the trial found

`git merge --no-commit origin/main` in a throw-away worktree:

- **8 files conflict**: 6 documents and 2 code files.
- **The rest merges by itself**, including `CLAUDE.md` (199 lines with both sides' changes:
  main's text, plus the branch's new hard rule on passwords).
- **No file under `backend/src`, `backend/template.yaml` or `frontend/src/views` is touched by
  both sides.** The back end is unchanged by the branch, so nothing has to be deployed because of
  the merge.

| File | Hunks | What clashed |
|---|---|---|
| `frontend/src/services/cognito.ts` | 2 | **Both sides wrote a `cognitoRequest`** (see D3) |
| `frontend/tests/unit/services/cognito.test.ts` | 1 | The import lines: the branch's new functions, main's `revokeToken` and `toRevokeOutcome` |
| `docs/FRONTEND_SERVICES.md` | 9 | Both sides used v9 and section 21; the service table, `cognito.ts`'s rows, the unit-test table of section 10.4, the tree of section 14.1 |
| `frontend/CLAUDE.md` | 3 | "deployed nowhere" (branch) against "deployed as `shared-calendar-web`" (main); the list of services; the list of journeys |
| `docs/FOLDER_STRUCTURE.md` | 2 | The lines of `services/` and `tests/integration/`; the branch still has `template.yaml` as "reserved, not yet" |
| `docs/ARCHITECTURE.md` | 1 | The change log: main's v13 row, the branch's v14 row |
| `docs/COMMANDS.md` | 1 | The list of front-end journeys |
| `docs/journeys/README.md` | 1 | Each side added one row to the same table |

### 2.1 The numbers both sides took

In `docs/FRONTEND_SERVICES.md` both sides used the same free numbers:

| What | On `main` | On `change-password` |
|---|---|---|
| Version | v8 the sign-out, v9 the assistant (already renumbered once, by the previous merge) | v9 the change of password |
| Section | 20 `LogoutService`, 21 `AssistantService` | 21 `ChangePasswordService` |
| Decisions | 46 to 58 the sign-out, 59 to 62 the assistant | 50 to 55 the change of password |
| Sections 14.9, 14.10 | free | the change of password's journey and acceptance |

`docs/ARCHITECTURE.md` does not clash: main is at v13 (open) and has no section 6.9; the branch
adds v14 and 6.9.

The renumbered references live in about 45 places: `docs/FRONTEND_SERVICES.md` itself,
`docs/CHANGE_PASSWORD_PLAN.md`, `docs/ARCHITECTURE.md`, `docs/journeys/frontend/change-password.md`,
`frontend/src/services/change-password.service.ts`, `change-password.types.ts`, `cognito.ts`,
and both of their tests. `npm run lint` (`scripts/doc-references.mjs`) checks that a reference
exists, not that it points at the right item, so every hit must be read.

## 3. The decisions

All seven were taken by the Product Owner on 2026-11-23, each as recommended in the last column.

| # | Question | Options | Decided |
|---|---|---|---|
| D1 | How to merge | (a) merge commit `--no-ff`, as for `deploy-frontend`; (b) rebase `change-password` onto `origin/main`, then fast-forward | **(a)**. A rebase is possible, since the branch was never pushed and no record cites its ids. But it would replay the conflicts on each of the two commits, and `main` would then show two commits that claim numbers they did not have when they were written |
| D2 | Which side gives up its numbers (section 2.1) | (a) the branch; (b) main | **(a) the branch.** Main's numbers are already pushed, already renumbered once, and cited by the record of a deployment (`docs/RUNBOOK.md`, `docs/CONVERSATIONAL_PLAN.md`). The branch's become **v10, section 22, decisions 63 to 68**; sections 14.9 and 14.10 keep their numbers |
| D3 | The two `cognitoRequest` functions in `cognito.ts`. Main's is private, takes `'InitiateAuth' \| 'RevokeToken'` and an `init` (for `keepalive: true` on the revocation), with main's decision 58 saying so. The branch's is exported, takes a `CognitoTarget` (`InitiateAuth`, `ChangePassword`, `GlobalSignOut`), has no `init`, and comes with `readCognitoBody` and `readCognitoError` | (a) one exported `cognitoRequest`, `CognitoTarget` with all four targets, main's `init` parameter kept; `toRevokeOutcome` left as main wrote it. (b) the same, and `toRevokeOutcome` also rewritten onto `readCognitoBody` and `readCognitoError`. (c) two functions, each side's own | **(a)**. One request for any target, which both sides meant, with the least code changed in a merge. Main's decision 58 is amended to say the function is exported and serves four targets. (b) is a clean-up that can follow as its own commit, with its tests |
| D4 | After a successful change, the page's state. `ChangePasswordService` clears the store; main's `LogoutService` also calls `reset()` on the page-wide `LoginService` and `RefreshService` (main's decision 53) | (a) leave the service as it is; step p3 (the screen, in `views/shell.ts`) decides how the page reacts, and may call the same `reset()`s. (b) change `ChangePasswordService` in the merge to take the same `Resettable[]` | **(a)**. The merge joins two lines; it should not redesign a service. Write the question into `docs/CHANGE_PASSWORD_PLAN.md` step p3, so that it is answered there. Note: the main shell's per-person teardown already reacts to an empty store, as it does for "Sign out" |
| D5 | The change-password plan's text that `main` made untrue: "the hosting of the front end" out of scope (section 6); "the walk by hand in the cloud waits for the front end's hosting, which is not designed" (section 5); step p4 proving it only by the smoke test | (a) amend `docs/CHANGE_PASSWORD_PLAN.md` in the merge: the hosting is done; step p4 gains a release of the page from `main` (`npm run deploy -w frontend`, only when asked) and a walk of the screen at the deployed page; (b) leave the plan as it is and amend it at step p3 | **(a)**, as was done for the conversational plan's P7 in the previous merge: the plan should be true the day it lands on `main` |
| D6 | The row "logout (not designed yet)" in the service table of `docs/FRONTEND_SERVICES.md` section 4.8, kept by the branch | Dropped; main's `LogoutService` row kept, the branch's `ChangePasswordService` row added after it (section 22) | Only option that is true |
| D7 | Push and the branch afterwards | (a) push `main` after you review the merge commit, then delete the local `change-password` branch and this worktree; (b) push `change-password` too, for the record | **(a)**. Nothing cites the branch by name outside its own documents |

## 4. The steps

Each step is done by Claude Code on your instruction; none acts in the cloud.

1. **Start clean.** In this worktree: commit `prompts/e04-merge-into-main.md` and this document
   to `change-password` (or keep them for the merge commit: either is fine), then
   `git fetch origin`.
2. **A work branch from main.** `git switch -c merge-change-password origin/main`, then
   `git merge --no-ff --no-commit change-password`. (This worktree has `change-password`
   checked out; the work branch is made here, so `main` is not needed in this worktree.)
3. **Resolve the 8 conflicts** as in section 5.
4. **Renumber** as decided in D2, every reference of section 2.1 changed with it, and a note in
   the change log of `docs/FRONTEND_SERVICES.md` (v10 row: "first numbered v9, after the
   assistant's v9"), as the previous merge did.
5. **Bring into line what merged by itself but is now untrue** (section 6).
6. **Run the checks** (section 7). The order matters; never two journeys at once.
7. **Commit** the merge, with a message that lists every resolution, the renumbering and the
   checks, in the style of `3070d5b`. Set this document's status to "Done".
8. **Stop for review.** Then, on your word: `git switch main` in the main checkout,
   `git merge --ff-only merge-change-password`, `git push origin main`; delete
   `merge-change-password` and `change-password` (D7).

## 5. How each conflict is resolved

| File | Resolution |
|---|---|
| `frontend/src/services/cognito.ts` | The header comment names both: the request for any target, the reading of its answer, `InitiateAuth` for login and refresh, `RevokeToken` for logout, with `docs/FRONTEND_SERVICES.md` sections 10.1 and 20.5. One exported `cognitoRequest(config, target, body, init = {})`, `CognitoTarget` = `'InitiateAuth' \| 'RevokeToken' \| 'ChangePassword' \| 'GlobalSignOut'` (D3); `config` typed as `Pick<CognitoConfig, 'cognitoUrl'>`, as the branch needs it (its service has no client id); main's `initiateAuth` and `revokeToken` kept; the branch's `readCognitoBody` and `readCognitoError` kept. The reference "decision 55" in it becomes 68 |
| `frontend/tests/unit/services/cognito.test.ts` | Both import lists joined (`cognitoRequest`, `readCognitoBody`, `readCognitoError`, `revokeToken`, `toRevokeOutcome`; fixtures `call`, `cognitoError`, `cognitoTokens`, `json`, `jwt`). Both sides' tests kept; the branch's test of `cognitoRequest` gains one case for `init` (a `keepalive` passed through), and the branch's test that lists the targets includes `RevokeToken` |
| `docs/FRONTEND_SERVICES.md` | Title: "… login, session, refresh, logout, Hello World, users, the shared calendar, the assistant and the change of password". Status and date: v10. Change log: main's rows, then the branch's row as v10 with its renumbering note. Section 1's history sentence: main's, plus "since v10 the change of one's own password (22)". Section 4.8 table (D6). Section 10's table and 10.4's test table: both sides' rows. Section 14.1 tree: logout, assistant (21, v9), change-password (22, v10). The branch's section 21 becomes 22, its decisions 63 to 68, its "v9" marks "v10"; sections 14.9 and 14.10 say v10. Main's decision 58 amended (D3) |
| `frontend/CLAUDE.md` | Main's opening (deployed as `shared-calendar-web`, the panel), plus "the change of one's own password has its service and no screen yet". Services list: main's with `logout`, plus `change-password` (straight at Cognito, no route). Journeys: `logout.service.test.ts` and `change-password.test.ts` both |
| `docs/FOLDER_STRUCTURE.md` | Both services named, `logout` included; `cognito.ts` "one request for any target of Cognito". The journeys line keeps `change-password.test.ts`; the "reserved, not yet" `template.yaml` line is dropped, as main lists the real one |
| `docs/ARCHITECTURE.md` | Main's v12 and v13 rows as main has them, then the branch's v14 row |
| `docs/COMMANDS.md` | The journey list with both: `logout.service.test.ts` and `change-password.test.ts`; main's note on the sign-out's journey kept |
| `docs/journeys/README.md` | Both rows kept: `frontend/logout.md` and `frontend/change-password.md` |

## 6. What merges by itself but has to change

Found by reading; the checks would not find them.

- **`docs/CHANGE_PASSWORD_PLAN.md`** (D4, D5): the hosting no longer out of scope; risk F2's
  sentence on the walk in the cloud; step p3 asked to decide the page's reaction to a successful
  change beside `LogoutService`; step p4's release of the page and walk at the deployed page;
  every reference to `docs/FRONTEND_SERVICES.md` section 21 and decisions 50 to 55 renumbered.
- **`docs/ARCHITECTURE.md` section 6.9 and the v14 row**: read for "the page" as if it ran
  locally only; the deployed page (`shared-calendar-web`, the custom domain) is where the change
  will happen in the cloud. The page's Content-Security-Policy already allows Cognito
  (`connect-src` in `frontend/template.yaml`, put there for login and logout), so no template
  change is needed: to be confirmed by reading, not assumed.
- **`docs/ARCHITECTURE.md` section 7**: main's c15 added text on the assistant's deployment;
  check that the branch's changes to 7.1 to 7.4 still read in order with it.
- **`CLAUDE.md`**: merged at 199 lines. Read it once: nothing to add, unless D5 brings a new
  command.
- **`frontend/src/services/change-password.service.ts`** and `.types.ts`, both test files, and
  `docs/journeys/frontend/change-password.md`: the renumbered references only. Per
  `CLAUDE.md`, the journey's page changes in the same commit as anything that changes the
  journey; here the journey's code does not change, only its references.

## 7. The checks

In this order, the local stack restarted first (`local:down`, `local:up`, `local:api`), because
the back end's journeys empty the calendar table:

| Check | Expect |
|---|---|
| `npm run typecheck`, `npm run lint` | Green; the comment rule finds every reference |
| `npm run test:unit` | Green, 100 % lines where required; both sides' tests of `cognito.ts` |
| `npm run verify -w frontend` | Green, the template's lint included |
| `DYNAMODB_PORT=8002 npm run verify` | Green, the back end's journeys included |
| `RUN_INTEGRATION=1 npm run test:integration -w frontend` | Green, `logout.service.test.ts` and `change-password.test.ts` among them. Not at the same time as the back end's journeys |
| A grep for the old numbers: `grep -rnE "FRONTEND_SERVICES\.md sections? 21\|decisions? 5[0-5]" docs frontend shared` | Only main's own (the assistant's section 21) remain |
| The page in a browser, `npm run dev -w frontend`: sign in, "Sign out", sign in again | Main's logout unchanged by the new `cognitoRequest` |

No deployment comes with the merge. The change of password has no screen until step p3, so
releasing the page from the merged `main` would change nothing a person sees.

### 7.1 As run

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | Green |
| `npm run test:unit` | 4 726 tests green (shared 489, back end 1 737, front end 2 500), 100 % lines where required |
| `npm run verify -w frontend` | Green, `frontend/template.yaml` valid |
| `DYNAMODB_PORT=8002 npm run verify` | Green, the back end's 189 journey tests included |
| `RUN_INTEGRATION=1 npm run test:integration -w frontend` | 6 files, 77 tests green, `logout.service.test.ts` and `change-password.test.ts` among them |
| The search for the old numbers | None left in the change of password's text |
| The page in a browser | **Not run.** The logout journey drives the same `revokeToken` through the merged `cognitoRequest` against cognito-local; the views are not changed by the merge |

The local stack and `local:api` were already running from the main checkout, on `main`, whose
back end is the same as the merge's, so they were not restarted. This worktree's
`backend/env.local.json` (git-ignored) named an older local user pool, so the first run of the
root `verify` failed with `User Pool … not found`; it was replaced by the main checkout's copy,
and the run passed.

## 8. What is left after the merge

- Review the merge commit, then move `main` to it and push (step 8 of section 4, D7).
- `docs/CHANGE_PASSWORD_PLAN.md` step p3, with D4's question in it.
- The clean-up of D3 (b), if you want it, as a commit of its own.
