## Brief

Decide how the front end is deployed to the web, so that people can really use it, and make that
deployment a step of the deployment process. The views are complete and run locally
(`docs/FRONTEND_VIEW_PLAN.md`, done 2026-11-20); what stands between them and a deployment is
the open points of `docs/FRONTEND_ARCHITECTURE.md` section 10. This brief settles the ones that
block a deployment and plans the work. **It writes documents only**: no application code, no
template, no script, no cloud command that creates, changes or deletes anything.

The direction, agreed on 2026-11-21 before this brief:

- **Hosting (O1).** The three files of `frontend/dist/` in a private S3 bucket, served by a
  CloudFront distribution over HTTPS on its own `…cloudfront.net` address. A separate SAM
  template and stack, `frontend/template.yaml`, as `docs/FOLDER_STRUCTURE.md` section 7 already
  says: a release of the page never changes the stack `shared-calendar-api`.
- **One origin (O2).** The same distribution passes `/api/…` on to the API, with the prefix
  removed, as the dev server does locally. The API gets no CORS configuration and
  `backend/template.yaml` is not changed.
- **The Content-Security-Policy (O5).** `default-src 'self'`, plus Cognito's address for the
  login, sent by the distribution with the page.
- **Logout (O7).** "Sign out" revokes the refresh token at Cognito before it clears the session.
  The design of that service is a plan step of its own, not this brief.
- **The deployment.** `npm run deploy -w frontend`, behind the same gate as the back end's: it
  reads the back end's stack outputs, deploys the hosting stack, builds, uploads. Run after the
  back end's deploy.

Read these in full first:
- `CLAUDE.md`, in particular "Where the truth lives", "Working rhythm", "Hard rules from the
  design" and "Cloud safety".
- `docs/FRONTEND_ARCHITECTURE.md` sections 10 (the open points), 11 (the decisions' table) and
  12 (the build and the dev server).
- `docs/FRONTEND_SERVICES.md` sections 9.6 and 10.3, and what it says of logout (section 4.8,
  section 9.4).
- `docs/FOLDER_STRUCTURE.md` sections 4.5, 5 and 7.
- `docs/ARCHITECTURE.md` section 8.1 (the deploy gate), `backend/scripts/verify.sh`,
  `backend/scripts/deploy.sh`, `backend/scripts/target.sh`, `backend/samconfig.toml`.
- `frontend/scripts/build.mjs` and `frontend/scripts/dev.mjs`.
- `docs/AWS_ACCOUNTS.md`: the organization's policy on regions.

Check the facts the design rests on in the AWS documentation, not from memory: that the
`Authorization` header reaches the API through the distribution, that a CloudFront Function may
remove the path's prefix, and what `RevokeToken` needs. A read-only `aws` command is allowed to
see whether the account can reach CloudFront at all.

## What to write

1. **`docs/FRONTEND_ARCHITECTURE.md`, a new version.** A new section on the hosting and the
   deployment: what the browser talks to; the stack and each of its resources in plain words
   (the reader is not an Infrastructure-as-Code expert); the API through the page's address and
   what that changes for the API (its logs, its own address); the headers sent with the page;
   the files and their caching; the deploy command, its gate, where its values come from and
   what it checks at the end; the direction for logout; what is left out on purpose (a domain
   of our own, the distribution's logs) and why. Section 10: O1, O2 and O5 decided, O7 with
   its direction, each row saying where the decision is written; new open points numbered on.
   Section 11: one row per decision, every one marked for review.
2. **A plan, in a new file `docs/FRONTEND_DEPLOY_PLAN.md`**, in the shape of
   `docs/FRONTEND_VIEW_PLAN.md`: steps numbered from 70, each with what it builds, the files it
   touches and its acceptance check; the steps that act on the cloud say that they need an
   explicit instruction; the last one leaves the page in use and the documents saying so.
   Risks, with what is done if CloudFront turns out to be blocked for this account.
3. **In the same change, no more than needed:** `docs/FOLDER_STRUCTURE.md` section 7,
   `docs/FRONTEND_SERVICES.md` section 10.3 (where the gap is now decided) and `CLAUDE.md`
   ("Where the truth lives").

## Hold to

- The hard rules of `CLAUDE.md`: no wildcard action or resource in a policy, the bucket's
  included; nothing about a deployed stack in a committed file; no secret in a log, an argument
  or a file.
- The simplest design that works. No library, no AWS service beyond S3 and CloudFront, no
  second copy of a rule the dev server already follows: the deployed page and the local one
  should differ in as little as possible, and the document says where they differ.
- The scripts' rules: bash 3.2 and 5, macOS and Linux, node, the AWS CLI, curl and git only.

## Do not

- Do not write `frontend/template.yaml`, a script or any code, and do not change
  `backend/`, `shared/`, `frontend/`, `eslint.config.js` or a `package.json`: that is the
  plan's first step, after my review.
- Do not run `sam deploy` or any `aws` command that creates, changes or deletes a resource.
- Do not design the logout service here: say the direction and what the step must find out.
- Do not commit.

## Report

What is decided and where it is written; every point where you decided something I have not
seen before, so that I can review those first; what could not be checked without a deployment;
and the steps, with which of them need my instruction.
