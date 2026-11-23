# The merge of `deploy-frontend` into `main`: strategy and conflicts

| | |
|---|---|
| Status | Done on 2026-11-23: the merge commit on `main` whose message begins "Merge branch 'deploy-frontend' into main", not pushed that day. Nothing was deployed |
| What it is | The record of how the branch `deploy-frontend` was merged into `main`: the strategy, the decisions taken, how each conflict was resolved and what was checked |
| What it is not | A source of truth. What the code and the page are is in the documents of `CLAUDE.md` ("Where the truth lives"); this page only says how two lines of work were joined |
| Brief | `prompts/a16-merge-branch-deploy-front-end.md` |

## 1. The two lines of work

Both branches started from `7a6f02c` (the folder map of `CLAUDE.md` cut down).

| Branch | Commits since `7a6f02c` | What they did |
|---|---|---|
| `deploy-frontend` | 9, 2026-11-21 to 2026-11-22 | The page's hosting (`frontend/template.yaml`, `npm run deploy -w frontend`, the shared gate `scripts/deploy-gate.sh`), logout (`LogoutService`, `RevokeToken`), the first deployment of the stack `shared-calendar-web`, the old stack `hello-world-api` deleted (`docs/IMPLEMENTATION_PLAN.md` step 58), the page's own name (`docs/CUSTOM_DOMAIN.md`) |
| `main` | 17, 2026-11-21 to 2026-11-23 | `CLAUDE.md` rewritten under 200 lines (with `docs/COMMANDS.md` as the home of the commands' notes), and the conversational interface, steps c00 to c13 of `docs/CONVERSATIONAL_PLAN.md`: the assistant's back end, `AssistantService` and the panel at the bottom of every screen |

Two of the branch's steps act in the cloud and had already been done: the page is live, and the
old stack is gone. The merge had to bring the repository in line with that, not change it.

## 2. The strategy

1. **A trial first.** The merge was made once in a throw-away worktree, outside the repository,
   to see the conflicts and to run the unit tests on the result before anything was decided.
   It found 8 files in conflict, all of them documents; the code merged by itself.
2. **The decisions, taken before the real merge** (section 3), by the Product Owner, on a
   written plan.
3. **A merge commit, made on a branch of its own.** `git switch -c merge-deploy-frontend main`,
   then `git merge --no-ff --no-commit origin/deploy-frontend`. Every resolution, every
   renumbering and every document brought in line went into that one commit, so that `main`
   never holds a half-merged state. When it was done, `main` was moved to it with
   `git merge --ff-only` and the work branch deleted.
4. **No rebase and no squash.** `docs/RUNBOOK.md` and `docs/FRONTEND_DEPLOY_PLAN.md` name the
   branch's commits as the source of what is deployed (`646b706`, `4ee5065`); a rebase or a
   squash would have given those commits new ids and left the record pointing at nothing.
5. **Checks before the commit** (section 6), then the commit, then a stop: pushing is the
   Product Owner's.

## 3. The decisions

| # | Question | Decided |
|---|---|---|
| D1 | How to merge | A merge commit (`--no-ff`) |
| D2 | Which side gives up its numbers where both used the same ones | The assistant's, from `main`: the branch's numbers are older (2026-11-21) and already cited by the record of the deployment |
| D3 | Where the branch's additions to `CLAUDE.md` go | Into their single home; `CLAUDE.md` keeps a few lines and stays under 200 |
| D4 | The lines `a.txt`, `b.txt`, `c.txt` the branch added to `.gitignore` | Dropped: scratch files of the custom-domain work |
| D5 | When to release the page from the merged `main` | Only after the assistant's back end is deployed (`docs/CONVERSATIONAL_PLAN.md` step c15): until then the panel would call routes that do not exist in the cloud |
| D6 | The conversational plan's open point P7 and steps c14 to c16 | Amended in the merge (section 5) |
| D7 | The remote branch `deploy-frontend` | Kept until the page has been released once from `main` |

## 4. The conflicts and how each was resolved

| File | What clashed | Resolution |
|---|---|---|
| `.gitignore` | `main` added `future-improvements.md`, the branch three scratch files | `main`'s line kept, the branch's dropped (D4) |
| `docs/journeys/README.md` | Each side added rows to the same table | All rows kept: the assistant's three pages and the logout page |
| `docs/FOLDER_STRUCTURE.md` | The lines of `services/` and `tests/integration/` in the tree; `main` still had `template.yaml` as "reserved, not yet" | Both services and both journeys named; the reserved line dropped, the branch already lists the real `template.yaml` |
| `docs/ARCHITECTURE.md` | The change log: `main` closed v12 and opened v13 for the assistant; the branch added a sentence to v12 | `main`'s rows kept, the branch's sentence on the front end placed inside v12, before its closing |
| `CLAUDE.md` | `main` had rewritten the file to 198 lines; the branch had added about 130 lines to the old long one | `main`'s file taken whole, then the branch's facts added in a few lines (D3; section 5) |
| `docs/FRONTEND_SERVICES.md` | Both sides wrote v8, section 20 and decisions from 46 up | Both kept, the assistant renumbered (D2; below) |
| `docs/FRONTEND_ARCHITECTURE.md` | The status row; the change log v13 to v14 (`main`) against v13 to v18 (branch); decisions from 138 up | Both kept, the panel renumbered; one status row that says both |
| `docs/FRONTEND_WALK.md` | Both added a v2 to the change log | Both kept, the panel renumbered |

### 4.1 The renumbering

| Document | The branch keeps | The assistant was | The assistant is |
|---|---|---|---|
| `docs/FRONTEND_SERVICES.md` | v8, section 20 (`LogoutService`), decisions 46 to 58 | v8, section 20, decisions 46 to 49 | v9, section 21 (`AssistantService`), decisions 59 to 62 |
| `docs/FRONTEND_ARCHITECTURE.md` | v13 to v18 (the hosting and logout), decisions 138 to 158 | v13 and v14, decisions 138 to 153 | v19 and v20, decisions 159 to 174 |
| `docs/FRONTEND_WALK.md` | v2 (check 4 sees the request to Cognito) | v2 | v3 |

How it was done, so that no number of the branch was touched by mistake:

1. **Renumber `main`'s side alone, before merging the file.** A script compared `main`'s copy of
   each document with the common ancestor and changed numbers only in the lines `main` had
   added; the lines both sides inherited were left as they were. Every changed line was read.
   A reference wrapped over two lines ("decision" at the end of one, "46" at the start of the
   next) was found by hand.
2. **Merge that renumbered copy with the branch's**, three ways (`git merge-file`), against the
   common ancestor. What still clashed was text that both sides had added at the same place
   (two change-log rows, two decision lists, two whole sections at the end of
   `docs/FRONTEND_SERVICES.md`): each was resolved by keeping the branch's text first and the
   assistant's after it, in the order of the new numbers.
3. **Fix the citations elsewhere.** About 25 places cite those numbers: comments in
   `frontend/src/services/assistant.*`, `frontend/src/logic/texts.ts` and one unit test, the
   three journey pages of the assistant, `docs/journeys/concepts.md`,
   `docs/CONVERSATIONAL_ARCHITECTURE.md` and `docs/CONVERSATIONAL_PLAN.md`. Each was found by
   searching the lines `main` had added for the document's name followed by a moved number, then
   changed. The citations of logout (`shell.ts`, `logout.*`, `cognito.ts`, `logout.md`) were
   already right and were left alone. `npm run lint` checks that a cited section exists, not that
   it is the one meant, which is why this was done by reading.
4. **Say it in each document.** A row "v9, note", "v20, note" and "v3, note" in the three change
   logs records the old and the new numbers.

The briefs in `prompts/` were not changed: they are what was asked at the time.

## 5. What merged cleanly but had to change

Git joins text; it does not know that one side made the other's sentences untrue. These were
found by reading, and changed in the same commit:

- **`CLAUDE.md`**: the page is deployed as the stack `shared-calendar-web`; the old stack is
  deleted; `npm run deploy` names `-w frontend` too under "Cloud safety"; the deploy gate holds
  for both deployments; `docs/FRONTEND_ARCHITECTURE.md` section 13, `docs/CUSTOM_DOMAIN.md` and
  `docs/FRONTEND_DEPLOY_PLAN.md` named in the lists of documents. Room was made by shortening three
  entries; the file has 199 lines.
- **`docs/COMMANDS.md`**, the home of the branch's command notes: `npm run deploy -w frontend` in
  full, `verify -w frontend` that also lints the template, the dev server's stricter
  Content-Security-Policy, the logout journey, the old stack and its profile as they now are.
- **`frontend/CLAUDE.md`**: no longer "deployed nowhere"; the template, `samconfig.toml`,
  `deploy.sh`, the logout service and its journey in the folder map.
- **`docs/CONVERSATIONAL_PLAN.md`** (D6): open point P7 is met by the page's hosting, which
  passes every path under `/api/` on to the API with all seven methods; step c14 builds on the
  branch's `backend/scripts/deploy.sh`; step c15 gains point 8, the page released again after
  the back end, with a short walk of the panel at the deployed page; step c16 records P7 as met.
  **`docs/CONVERSATIONAL_ARCHITECTURE.md`** v17 says the same of P7.
- **`frontend/src/views/shell.ts`** merged by itself and was read: "Sign out" calls the
  `LogoutService`, the store empties, and the per-person teardown unmounts the assistant's
  panel. Nothing had to change.

## 6. The checks

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | Green |
| `npm run test:unit`, every package | 4 622 tests, green, 100 % lines where required |
| `npm run verify -w frontend` | Green, `frontend/template.yaml` valid |
| `DYNAMODB_PORT=8002 npm run verify` (the back end's journeys included) | Green |
| `RUN_INTEGRATION=1 npm run test:integration -w frontend` | 72 tests, green, logout and the assistant among them |
| The merged page in headless Chromium, at a desktop and a phone width, against the local stack with the fake Claude | Checks 3, 4 and 103 to 105 of `docs/FRONTEND_WALK.md`, and "Sign out" while the panel waits for an answer: all yes; the console held `zod`'s `eval` probe only (`docs/FRONTEND_WALK.md`, the v3 note) |

The local API was already running when the checks were made, and the back end's code is
unchanged by the merge, so it was not restarted. The rest of the walk was not run again.

## 7. What is left

- **Push `main`** after reviewing the merge commit.
- **Do not release the page** from `main` before `docs/CONVERSATIONAL_PLAN.md` step c15 (D5).
- **Delete `origin/deploy-frontend`** once the page has been released from `main` (D7).
- The checks still owed at the deployed page (`docs/RUNBOOK.md` section 5.5) are unchanged by
  the merge; step c15, point 8, is a good moment for them.
