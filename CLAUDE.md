# CLAUDE.md

What every session needs. The rest loads on its own: `backend/CLAUDE.md`, `frontend/CLAUDE.md`
and `shared/CLAUDE.md` when a file of that package is read, a file of `.claude/rules/` when a
file matching its paths is read. The commands in full: `docs/COMMANDS.md`.

## What this project is

A shared calendar on AWS, serverless: an Administrator publishes availability, users book,
cancel and change appointments; an administrative API creates and deletes users; a "Hello
World" route for registered users proves the chain API, authorizer, Lambda, DynamoDB works.
TypeScript, AWS Lambda, API Gateway (HTTP API), Amazon Cognito, DynamoDB, deployed with AWS SAM.

The repository is an npm-workspaces monorepo: the back end in `backend/`, the browser front end
in `frontend/` (a services layer and a view layer; it runs locally and is deployed as the stack
`shared-calendar-web`), and the code both share in `shared/` (package `@shared-calendar/shared`).

## Where the truth lives

Before changing anything, read `docs/ARCHITECTURE.md` and the documents below that govern the
part you touch.

- `docs/ARCHITECTURE.md`: the behaviour, the API contract, the data model and the security
  rules. On any conflict, the architecture wins.
- `docs/SHARED_CALENDAR_SPEC.md`: the shared calendar, as agreed with the Product Owner. Where
  it is merged into the architecture (the spec's section 19), the architecture wins as usual.
- `docs/IMPLEMENTATION_PLAN.md`: the order of work, with an acceptance check per step.
- `docs/FRONTEND_SERVICES.md`: the truth for the front end's services layer.
- `docs/FRONTEND_ARCHITECTURE.md`: the truth for the front end's view layer: the rules of a
  view (its section 3), the shape of a dialog and of a form (4), the logic layer (5.1), the
  shell (6), the tests (8), the open points (10), the tooling (12), the page's hosting (13).
- `docs/FOLDER_STRUCTURE.md`: the layout and where a new file goes.
- `docs/CONVERSATIONAL_ARCHITECTURE.md`, `docs/CONVERSATIONAL_PLAN.md`: the assistant, under way.
- `docs/RENAME_PLAN.md`: the move to the "shared-calendar" names (`hello-world-api` is deleted);
  the Hello World feature (`/hello`, its table `…hello-messages`) keeps its name.
- `prompts/`: the numbered briefs behind the documents and the code. Number new ones in sequence.

Not sources of truth; when one disagrees with the documents above or with the tests, it is the
one that is fixed:

- `README.md` (the newcomer's entry point), `docs/COMMANDS.md` (every command with its notes,
  the local stack's quirks), `docs/RUNBOOK.md` and `docs/CUSTOM_DOMAIN.md` (the operator's steps).
- `docs/FRONTEND_WALK.md`: every screen walked by hand in a browser; the check to repeat after
  a change to the view layer.
- `docs/journeys/`: the integration journeys in simple words, one page per `describe` block,
  written and checked with the project skill `explain-journey`. When a journey changes, its
  page changes in the same commit.
- `docs/FRONTEND_VIEW_PLAN.md`, `docs/FRONTEND_VIEW_OPTIONS.md`, `docs/FRONTEND_DEPLOY_PLAN.md`:
  records of finished work.

## Working rhythm

- Implement one plan step at a time. Run the step's acceptance check, report the result
  honestly (including failures), then stop for review before the next step. Commit only when asked.
- End every task with one or two simple sentences on what was done, then say plainly what the
  user must decide or do. No tables or long reports in that message unless the user asks.
- When the implementation proves the architecture wrong, say so and propose the document change.

## Hard rules from the design

- Handlers never import the AWS SDK directly. All AWS access goes through the modules under
  `backend/src/lib`. This keeps later features cheap.
- `shared/` imports no AWS SDK, no Node-only module and no DOM API: only TypeScript and `zod`.
  The API contract and the username rule live there and the back end imports them; a new error
  code or response field starts in `shared/src/api.ts`.
- Logs never contain tokens, passwords or the body of the create-user response.
- IAM policies never use a wildcard action or resource. One role per function, granting only
  what its route needs, scoped to the user pool and/or table it uses. The calendar's DynamoDB
  permissions are shared managed policies on the `calendar` table, attached per role
  (`docs/ARCHITECTURE.md` section 7.1).
- Every password is set as permanent. There is no forced password change and no e-mail sending.
- The API can never create an administrator, delete one, or set its password.
- Role resolution: `admin` wins over `user`; a token in neither group gets 403.

## Cloud safety

- Never run `sam deploy`, `sam delete`, `npm run deploy` (`-w backend` or `-w frontend`),
  `npm run budget` or an `aws` command that creates, changes or deletes resources unless
  explicitly instructed in the current request.
- `npm run verify -w backend` (all local tests) must be green before any deployment, of the API
  or of the page. Both deploy scripts enforce this (`scripts/deploy-gate.sh`); do not bypass it.
- Cloud: stacks `shared-calendar-api` (the API) and `shared-calendar-web` (the page) in
  `eu-north-1`, profile `shared-calendar-admin` (`aws sso login --profile shared-calendar-admin
  --use-device-code` when the session expires).
- Local development uses the Docker stack (DynamoDB Local, dynamodb-admin, cognito-local, a
  fake Claude) and `sam local start-api`, and needs no AWS account.

## Comments

Applies to every comment in every file. The whole rule, with its examples and the exemption of
test names, is `.claude/rules/comments.md`, which loads when a file of code is read.

- A comment says in plain words what the code does or why, so that it can be read without
  opening a document. A reference to the documentation backs up the comment, it does not
  replace it.
- A reference names the document by its path, in the same sentence as the item it points at,
  every time (`docs/SHARED_CALENDAR_SPEC.md R-BOOK-02`, `docs/ARCHITECTURE.md section 4`):
  never a nickname ("spec 8.4") or a bare item ("section 9.4", "R-BOOK-02"). The reference must
  exist in that document and say what the comment claims.
- No history in comments: no version tags, brief or step numbers, no "revised", "formerly",
  "now". A comment describes the code as it is.
- Enforced by `npm run lint` (`scripts/doc-references.mjs`); whether a comment is clear stays a
  matter for review.

## Tooling and style

- Node.js 22, TypeScript strict, esbuild bundling via SAM, vitest for tests,
  `aws-sdk-client-mock` for the back end's unit tests, `zod` for input validation.
- The back end's infrastructure is one `backend/template.yaml`. Explain infrastructure changes
  in plain terms: the reader is not an Infrastructure-as-Code expert.
- Prefer the simplest design that meets the architecture. Do not add libraries, abstractions or
  AWS services the architecture does not call for.
- Tests: vitest with globals enabled (`describe`, `it`, `expect` need no import). 100 % line
  coverage is enforced on `backend/src/lib`, `backend/src/assistant`, `shared/src` and
  `frontend/src`: new code there comes with its tests. Unit tests reach no network and no AWS.

## Everyday commands

From the repository root, after `nvm use` (Node 22 is pinned in `.nvmrc`; the machine default
may be newer). Each command's notes, and the ones not listed here (`build`, `audit`,
`bootstrap-admin`, `smoke`, `budget`, `deploy`): `docs/COMMANDS.md`.

```
npm ci                                              # at the root only, never inside a package
npm run typecheck                                   # every package
npm run lint                                        # every package, and the comment rule
npm run test:unit                                   # every package, no Docker
npm run verify -w frontend                          # the three above, then lints its template

DYNAMODB_PORT=8002 npm run local:up -w backend      # the emulators, seeded; idempotent
npm run local:api -w backend                        # the API on http://127.0.0.1:3000, foreground
npm run local:down -w backend                       # stops the emulators; the tables are lost
DYNAMODB_PORT=8002 npm run verify                   # back end's gate with its journeys, then front end's

DYNAMODB_PORT=8002 RUN_INTEGRATION=1 npm run test:integration -w backend
RUN_INTEGRATION=1 npm run test:integration -w frontend

npm run dev -w frontend                             # the page on http://localhost:5173, foreground
npm run seed:local -w frontend                      # a week to look at, in the local calendar
```

- One package: add `-w backend`, `-w frontend` or `-w @shared-calendar/shared`. A script's own
  arguments go after `--` (`npm run smoke -w backend -- local`).
- The back end's `verify` (so the root one too) and the integration tests need `local:up` and
  `local:api` running and never start them. Without `RUN_INTEGRATION=1` the integration tests
  run nothing and exit 0.
- `DYNAMODB_PORT=8002` on this machine (port 8000 is taken): the same value for every command.
- The local accounts: `admin` / `Admin-Local-Pass-1!` and `alice` / `Alice-Local-Pass-1!`.
- The shell is zsh: `set -- $var` does not word-split. Pass arguments explicitly.

What goes wrong most often:

- **The back end's calendar journeys empty the local `calendar` table first**, and `verify`
  runs them: calendar data made by hand is lost, and afterwards `seed:local` does nothing.
  Before a walk through the pages, restart the stack (`local:down`, `local:up`, `local:api`),
  then `seed:local`.
- Never run the back end's and the front end's integration tests at the same time: they share
  one local stack and nothing prevents it.
- After `npm run build -w backend`, restart `local:api`. Always build through npm, never a raw
  `sam build`.
- In a Codespace, after each start and before `local:api` (or the authorizer times out):
  `sudo iptables-legacy -I FORWARD -i br-+ -o br-+ -j ACCEPT`.
- `local:api` and `dev` run in the foreground. Stop a background `dev` with
  `pkill -f 'node scripts/dev[.]mjs'`, in a command that holds no other text matching it.

## Folder map

The annotated tree and where a new file goes: `docs/FOLDER_STRUCTURE.md` sections 2 and 3.

- Root: the workspaces' `package.json`, the one `package-lock.json`, `tsconfig.base.json`,
  `eslint.config.js`, `docs/`, `prompts/`, `scripts/` (the comment check), `.claude/`.
- `backend/`: the API. `src/handlers/` (one Lambda entry point per file), `src/lib/` (the only
  place that touches the AWS SDK), `src/assistant/`, `tests/`, `scripts/`, `template.yaml`.
- `frontend/`: `src/services/`, `src/logic/`, `src/views/`, `index.html`, `style.css`,
  `tests/`, `scripts/`.
- `shared/`: the API contract types, `Role`/`resolveRole`, the username schemas, and the
  calendar's time helpers, schemas and pure rules.

## Changing these files

"These files" are this one, each package's `CLAUDE.md` and the files of `.claude/rules/`.
Whoever changes one of them, a person or Claude Code, leaves all of them in line with Claude
Code's guidance for memory files (https://code.claude.com/docs/en/memory) before the work is
called done. A change may be drafted in any shape; it is not finished until these hold:

- **This file stays under 200 lines** and holds only what every session needs and could not be
  learnt by reading the code: the rules, the short list of commands, the pointers.
- A fact has one home: what concerns one package in that package's `CLAUDE.md`; what concerns
  some kinds of file in `.claude/rules/` with a `paths:` list; reference material (what a
  command does in detail, what a file holds, why something was decided) in a document under
  `docs/`, with one line here that points at it. Nothing is said twice; no two files disagree.
- An instruction is concrete enough to check: "run `npm run lint`", not "keep the code clean".
- No history and no status of finished work: no dates, versions, brief or step numbers of what
  was done. The state a session must know (which stack is in use) is stated as it is.
- Bold marks the few lines whose breach causes damage, nothing else.
- When a new line would break one of these, make room in the same change: move or delete what
  no longer earns its place, and say in the report what moved where.
- A change that renames or removes a section checks who points at it:
  `grep -rn "CLAUDE.md" README.md docs .claude scripts frontend/scripts eslint.config.js`.
