# AWS accounts and sign-in

Which AWS identity to use for what, and why the AWS sign-in page asks "Builder ID or root?".
The step-by-step operator tasks are in `docs/RUNBOOK.md`; this document explains who you are
when you do them.

This repository is public. Account ids, e-mail addresses and the access portal URL are
deliberately not written here. Find them in `~/.aws/config` (profile `hello-admin`, section
`sso-session hello`) or in the console.

---

## 1. The identities

Three different identities can sign in to AWS, and only one is meant for everyday work.

| Identity | What it is | Signs in with | Use it for |
|---|---|---|---|
| **IAM Identity Center user** | A user managed by IAM Identity Center, with its own "plus" e-mail address | The **access portal URL** (`https://ssoins-….portal.us-east-1.app.aws`) | **Everything in daily work**: console and CLI (`hello-admin`) |
| **Root user** | Owner of the **management account** (the account created at sign-up), with unlimited power | The normal AWS sign-in page, choosing **root**, using the sign-up e-mail | **Rare root tasks only** (section 4) |
| **AWS Builder ID** | A personal AWS profile that uses the **same e-mail** as root | The same sign-in page, choosing **Builder ID** | Nothing in this project. **Keep it; do not delete it** (section 5) |

## 2. The accounts

The console's multi-account setup created an AWS Organization with three accounts:

| Account | Contains | Who signs in there |
|---|---|---|
| Management account | Billing, the Organization, IAM Identity Center (home region `us-east-1`). **Not the stack.** | Root, rarely |
| **"Identity Delegated Admin"** | **The stack `hello-world-api`** in `eu-north-1`: Lambda functions, HTTP API, Cognito user pool, DynamoDB table, alarms | Identity Center user, role `AdministratorAccess` |
| "Side Quest Accepted" | Nothing | Nobody |

How the daily login reaches the stack:

```
Identity Center user
   │  signs in at the access portal (Identity Center lives in us-east-1)
   ▼
permission set "AdministratorAccess"
   │  assigned to
   ▼
account "Identity Delegated Admin"
   │  region eu-north-1
   ▼
stack hello-world-api
```

The organization policy allows regional services only in `eu-north-1`. In any other region the
console looks empty or shows "access denied". **Check the region selector first.**

---

## 3. Daily work: Identity Center user

Use this for deploying, smoke tests, bootstrap-admin, budgets, and reading logs, metrics,
Cognito users, the table and costs.

### Console

1. Open the **access portal URL** (bookmark it). Do **not** use the normal AWS sign-in page:
   that page offers only root and Builder ID.
2. Sign in as the Identity Center user (its own e-mail, password, MFA).
3. Expand **"Identity Delegated Admin"** and click **AdministratorAccess**.
4. In the console, set the region (top right) to **Europe (Stockholm) eu-north-1**.
5. Now Lambda, API Gateway, Cognito, DynamoDB, CloudWatch and CloudFormation show the stack's
   resources. Billing → Budgets also works here, because root once enabled "IAM user and role
   access to Billing information".

### CLI (Codespace or laptop)

```bash
export AWS_PROFILE=hello-admin
aws sts get-caller-identity          # must show the AdministratorAccess role in the
                                     # "Identity Delegated Admin" account
# when it fails because the session expired:
aws sso login --profile hello-admin --use-device-code
```

- **Device code:** in the Codespace, use `--use-device-code`. The browser-callback login does not
  work there.
- **Temporary credentials:** the credentials expire on their own (hours). There are no access keys
  to rotate or leak.
- **Profile settings:** the profile's SSO region is `us-east-1` (where Identity Center lives) and its
  client region is `eu-north-1` (where the stack lives). That difference is intended.
- **New machine:** set up the profile as in `docs/RUNBOOK.md` section 4.

### If something looks wrong

| Symptom | Likely cause |
|---|---|
| The sign-in page asks "Builder ID or root?" | Wrong page: use the access portal URL |
| Lambda/Cognito/DynamoDB pages are empty | Wrong region (use `eu-north-1`) or wrong account (you are in the management account as root) |
| "explicit deny in a service control policy" | A region other than `eu-north-1` |
| CLI: "Token has expired" / "SSO session … expired" | Run `aws sso login --profile hello-admin --use-device-code` again |

---

## 4. Rare root tasks: root user

Root is for the few things only root can do, or for when the daily login is broken. It works on
the **management account** and cannot see or change the stack directly.

### When to use root

- **Identity Center problems:** the Identity Center user is locked out, lost its MFA device, or
  needs a password reset; IAM Identity Center itself needs repair.
- **User and permission changes:** adding an Identity Center user, or assigning the
  `AdministratorAccess` permission set to another account (then add a matching CLI profile).
- **Account-level billing settings:** payment method, tax settings, "IAM user and role access to
  Billing information".
- **Organization settings:** service control policies, adding or closing member accounts.
- **Root's own credentials:** changing the root password or MFA device.
- **Contact details:** the account's contact information or alternate contacts.

### How

1. Open the normal AWS sign-in page (`https://signin.aws.amazon.com`).
2. Enter the sign-up e-mail. When asked, choose **root**, not Builder ID.
3. Enter the password and the MFA code.
4. Do the one task, then **sign out**.

### Rules for root

- **MFA:** MFA stays on.
- **No access keys:** never create root access keys, and never use root from the CLI.
- **No daily work:** never deploy or debug as root.
- **The "Close account" button:** never use it. On the management account it closes the
  whole Organization, including "Identity Delegated Admin" and the stack.

---

## 5. The Builder ID, and why it stays

A Builder ID is normally just a profile for AWS developer tools (Amazon Q Developer, Builder
Center, re:Post, Skill Builder, CodeCatalyst) and owns no AWS resources. This one is different.
Trying to delete it was refused (2026-11-02) with:

> Your builder ID profile is associated with an active AWS account that was created through an
> AWS application. To delete this profile, you must first close the account …

So the AWS account was created through a Builder ID sign-up, and the Builder ID is tied to it.
Most likely that is the management account itself. This is not confirmed: the `hello-admin`
profile cannot look into the management account. Deleting the Builder ID would therefore mean
closing that account and losing the Organization and the stack.

What to do:

- **Keep it.** The only cost is the extra question on the sign-in page, which the access portal
  avoids.
- **Protect it like root.** Use a strong, unique password and MFA, because it may be an owner
  identity of the account.
- **Do not pick it by mistake.** On the normal sign-in page, choose **root** for root tasks.
- **Optional check:** on `https://profile.aws.amazon.com`, look for the linked account or
  application and compare the account id with the management account's id (root console →
  Account).
