## Before opening the new session (operator, in your own terminal)

```bash
sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT   # only if the Codespace restarted
nvm use
```

No AWS login is needed: this step does not touch the cloud.

## Brief

Implement plan step 20 (monorepo move), following CLAUDE.md's working rhythm. Read
`docs/IMPLEMENTATION_PLAN.md` (step 20), `docs/FOLDER_STRUCTURE.md` (the target, lasting) and
`docs/FOLDER_MOVE_MAP.md` (the file-by-file map and order of work, throw-away) first, then
`docs/ARCHITECTURE.md` sections 4 and 12 and `README.md`.

## Where we are (2026-11-04)

- v1 is done: steps 1–12 committed, last commit `bb31a63`, annotated tag `v1.0.0`. Nothing
  after `36798a5` is pushed, the tag neither.
- The layout was decided in brief 20 and committed in `9191c28` (`docs/FOLDER_STRUCTURE.md`,
  `docs/FOLDER_MOVE_MAP.md`). The move itself has not been applied: today the back end is the
  whole repository (flat layout).
- The step was renumbered from 13 to 20 (uncommitted edit in `docs/IMPLEMENTATION_PLAN.md`), to
  leave 13–19 free for back-end follow-ups. The plan still says "step 13" in its status line and
  in the section 4 diagram: make those say 20 as part of this step.

## The map is older than step 12: corrections to apply

`docs/FOLDER_MOVE_MAP.md` was written at `0b29b8a`, before step 12. Where it disagrees with the
repository as it is now, the repository wins; apply these corrections and tell me if you find
others:

1. **Architecture change-log number.** The map (3.8) and `FOLDER_STRUCTURE.md` section 10 call
   the move's change-log line "v9". v9 is taken (step 12, "v1 implemented"). The move is
   **v10**. Fix the reference in `FOLDER_STRUCTURE.md` too. While there, the change-log table
   lists v9 above v8: put the rows in order.
2. **`README.md` is missing from the map.** It was written in step 12 with this move in mind:
   commands live in one "Commands" section and one layout line points to architecture section
   12. Update it: the `docs/FOLDER_STRUCTURE.md` row in its documents table (no longer "Not
   applied yet"), the commands to the `-w backend` form (FOLDER_STRUCTURE section 5), the
   layout sentence, the first-time `npm ci` / `npm install` now at the root, and the one
   `samconfig.toml` mention. Then re-run the README's commands the way step 12 did (see
   Acceptance).
3. **Architecture section 12** already holds the current layout plus one sentence pointing to
   `FOLDER_STRUCTURE.md` (step 12). The move replaces the body with the pointer described in map
   3.8. Section 14 assumption 6 and the v9 line already speak of the planned front end: adjust
   only wording that says the layout is "not applied" or "planned".
4. **Prompts.** `prompts/20-…` is already tracked (the map says untracked); `prompts/14-…` and
   this brief exist and stay where they are.
5. **Counts.** `samconfig.toml` is mentioned 8 times in `docs/RUNBOOK.md` (the map says 7) and
   twice in `docs/NEW_ACCOUNT.md`. Find references with `grep`, not by count: also look for
   `template.yaml`, `scripts/`, `src/`, `env.local.json`, `.verify-ok` and `npm run` in every
   document and in CLAUDE.md.
6. **CLAUDE.md** also lists the generated files and the deploy gate's `.verify-ok`; they now
   live under `backend/`.

## How we work in this step

- No deploy, no `sam delete`, no `aws` command at all. The next cloud deploy is a separate,
  normal one (`docs/RUNBOOK.md` section 2) that I run when I decide to.
- Behaviour must not change. The API, its contract, the template's resources, IAM, the scripts'
  arguments and outputs are identical before and after. The only code changes are the ones in
  map sections 2 and 3: moving `Role`/`resolveRole` and the username schemas to `shared/`,
  adding the contract types in `shared/src/api.ts`, typing `error()` with `ApiErrorCode` and the
  two 201 bodies with `satisfies`. If typing `error()` reveals a code the handlers use that is
  not in architecture section 4, stop and tell me: that is a contract question, not a typo.
- No new libraries. The only new dependency edge is `backend` → `@shared-calendar/shared`
  (workspace link). Versions of every existing dependency stay as in today's `package.json`;
  the lock file is regenerated, so compare `npm ls --all --workspaces` before and after for
  unexpected version jumps and report them.
- Hard rules still apply: handlers import no AWS SDK; `shared/` imports nothing but TypeScript
  and `zod` (the `shared/tsconfig.json` without `node` types enforces part of this); 100 % line
  coverage on `backend/src/lib` and on `shared/src`.
- Keep history readable: do the `git mv`s first, as their own change with no content edits
  (map section 4, item 2), so that `git log --follow` and the diff of the next change show the
  real edits. I will decide whether that becomes a separate commit when I review.
- The local stack is needed for the acceptance check. I start
  `DYNAMODB_PORT=8002 npm run local:up -w backend` and `npm run local:api -w backend` when you
  ask, after the move (the old root commands no longer exist then). Stop the old `local:api`
  and run `npm run local:down` before moving (map 4.1); move `.cognito/` and `env.local.json`
  together to `backend/`, or delete both and let `local:up` reseed.

## The one open technical question: `sam build` and the workspace link

Map section 4, "To confirm at step 5", is the only assumption not yet tested: that
`build_in_source = true` makes `sam build` bundle `@shared-calendar/shared` from the root
`node_modules` link without SAM creating a `backend/node_modules` or failing to resolve the
package. Test it **early**, right after the `shared/` package and the root `npm install` exist
and before the documentation edits, with one handler importing from shared. If it fails, try
the fallback of the map (`CodeUri: ../`) only after telling me what failed and why; that
fallback changes `template.yaml` and copies the whole repository into each build, so it needs
my agreement. Record whichever works in `docs/FOLDER_STRUCTURE.md` 4.3.

Also check the bundle does not grow unexpectedly: compare the size of each
`.aws-sam/build/<Function>/*.mjs` before the move (build once now) and after. A few hundred
bytes more for the shared types is expected (types vanish; the regex and `resolveRole` were
already bundled); kilobytes more means something extra was pulled in.

## What to change, in order

Follow `docs/FOLDER_MOVE_MAP.md` section 4, with the corrections above:

1. Baseline: `npm run build`, note the bundle sizes; `DYNAMODB_PORT=8002 npm run verify` green
   on today's layout (I start the stack when you ask), so that any later failure is the move's.
2. `git mv` per map section 1; `git rm tests/integration/.gitkeep`; generated files.
3. Root `package.json` (workspaces `["shared", "backend"]` only: npm rejects a missing folder),
   `tsconfig.base.json`, `backend/package.json`, the `shared/` package; clean `npm install` at
   the root; check the link and the absence of `backend/node_modules`.
4. Map sections 2 and 3.1–3.7. Root `npm run typecheck`, `lint`, `test:unit` green with both
   coverage thresholds.
5. `npm run build -w backend`: the open question above.
6. Local stack up, `DYNAMODB_PORT=8002 npm run verify -w backend` green, `backend/.verify-ok`
   written.
7. Documents (map 3.8 with v10, README, `docs/IMPLEMENTATION_PLAN.md` status line, section 1
   path convention and section 4 diagram with step 20 marked done, `docs/FOLDER_STRUCTURE.md`
   status "applied on <date>"), CLAUDE.md (map 3.9). Delete `docs/FOLDER_MOVE_MAP.md` and remove
   every reference to it (the plan's step 20, `FOLDER_STRUCTURE.md` section 10).

## Acceptance (plan step 20)

- `npm install` at the root on a clean checkout of the working tree (`rm -rf node_modules`
  first), then `DYNAMODB_PORT=8002 npm run verify -w backend` green against the local stack.
- `npm run build -w backend` produces bundles that contain the shared code: the username regex
  is in `backend/.aws-sam/build/CreateUserFunction/createUser.mjs` and `resolveRole`'s logic in
  the hello bundle; bundle sizes compared with the baseline.
- `npm run typecheck`, `npm run lint`, `npm run test:unit` from the root cover both packages.
- The README still works for a newcomer: run its commands in the order a newcomer would
  (`nvm use`, the root install, `local:up`, `local:api`, the curl sign-in and the three routes
  as `alice` and `admin`, `verify`) and fix it wherever real output differs.
- `npm run smoke -w backend -- local` passes (journeys against the local stack through the
  moved scripts; it prompts for the admin password `Admin-Local-Pass-1!` on stdin).
- `npm run deploy -w backend` without a fresh verify still refuses with its message and exits 1
  (proves the gate moved with the scripts; it must stop before any AWS call).
- `grep -rn` over `docs/`, `README.md` and `CLAUDE.md` finds no stale root path
  (`scripts/…`, `src/…`, root `samconfig.toml`/`template.yaml`) and no bare back-end
  `npm run local:…` / `verify` / `deploy` / `smoke` without `-w backend`, except in the
  historical parts (change logs, `prompts/`, plan steps 1–12 which section 1 now declares
  relative to `backend/`).

Report each result, including anything you could not run, then stop for review. When I ask,
commit (moves and edits, as I decide at review). Do not push and do not deploy.
