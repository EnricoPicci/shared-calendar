# The page under a name of our own: the procedure

| | |
|---|---|
| Status | Done once, on 2026-11-22, from commit `4ee5065` on the branch `deploy-frontend`: the page answers at `https://calendar.enricopiccinin.com` |
| What it is | The steps a person follows to give the deployed page an address that is easy to remember, in the place of `https://<id>.cloudfront.net` |
| What it is not | A source of truth. The hosting is defined by `docs/FRONTEND_ARCHITECTURE.md` section 13, the release by `docs/RUNBOOK.md` section 2. **Those documents do not yet know of the name** (section 9 below) |
| For whom | The operator: the person with the AWS profile `shared-calendar-admin` and with access to the domain's DNS |

In the commands, `calendar.example.com` stands for the name you choose and `example.com` for
the domain you own.

## 1. In short

1. Choose a name under a domain you own: `calendar.example.com`.
2. Ask AWS for a certificate for that name, in the region `us-east-1`.
3. Add a **first DNS record** (a CNAME) that proves to AWS the domain is yours. Wait until
   the certificate is issued.
4. Add a **second DNS record** (a CNAME) that points the name at the page's distribution.
5. Release the page once with the name and the certificate:
   `PAGE_DOMAIN=… PAGE_CERTIFICATE_ARN=… npm run deploy -w frontend`.
6. Check the page at its new address.

About an hour, most of it waiting. Later releases are the plain `npm run deploy -w frontend`.

## 2. What you need before starting

| What | Why |
|---|---|
| The page already deployed (the stack `shared-calendar-web`) | The name is added to the distribution that exists; `docs/RUNBOOK.md` section 3.1 creates it |
| A domain you own, and the right to add records to its DNS | Two CNAME records are added by hand. Done here with GoDaddy; any DNS provider works |
| The AWS profile `shared-calendar-admin`, signed in | To ask for the certificate and to release |
| The account allowed to use AWS Certificate Manager in `us-east-1` | CloudFront accepts a certificate from that region only. This account is (seen on 2026-11-22), though the organization's policy blocks other regional services outside `eu-north-1` |
| The local stack able to run | The release sits behind the deploy gate, which wants a fresh `verify` |

Cost: the certificate is free and renews itself. A subdomain of a domain you already own
costs nothing. Nothing is added to the AWS bill.

## 3. Choosing the name

Take a **subdomain**: `calendar.example.com`, not a folder such as `example.com/calendar`.

- A subdomain is one more DNS record beside the others: the main site is not touched.
- The page stays at the top of its own address, so it asks for `/app.js` and `/api/…` as it
  does today, and no code changes.
- A browser treats it as a site of its own. Under a folder, every script of the main site
  would count as the same site as the page where people type their password.

## 4. The procedure

Run the commands from the repository root. Sign in first:

```
export AWS_PROFILE=shared-calendar-admin
aws sso login --profile shared-calendar-admin --use-device-code
```

### Step 1. Ask AWS for the certificate

```
aws acm request-certificate \
  --domain-name calendar.example.com \
  --validation-method DNS \
  --region us-east-1
```

The answer holds the certificate's ARN, its identifier. It starts with `arn:` and looks like
`arn:aws:acm:us-east-1:<account number>:certificate/<an id with dashes>`. Keep it in a
variable, without the double quotes of the answer:

```
CERT_ARN='arn:aws:acm:us-east-1:…'
```

Run the request once only: every run asks for a new certificate. A lost ARN is found again
with `aws acm list-certificates --region us-east-1`.

If the answer is "AccessDenied … service control policy", the organization blocks the region:
stop and ask for an exception for ACM in `us-east-1`.

### Step 2. Read the record AWS wants to see

```
aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region us-east-1 \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

It shows a `Name` (like `_abc123.calendar.example.com.`) and a `Value` (like
`_def456.acm-validations.aws.`). If it shows `null`, wait a few seconds and ask again.

### Step 3. The first DNS record: the proof that the domain is yours

Where the domain's DNS is managed, add a record:

| Field | What to enter |
|---|---|
| Type | CNAME |
| Name | the `Name` of step 2 **without the domain at its end**: `_abc123.calendar` |
| Value | the `Value` of step 2, without the final dot |
| TTL | the default |

**The usual mistake:** GoDaddy, like most providers, adds the domain to the name by itself.
The full name pasted there becomes `_abc123.calendar.example.com.example.com`, and the
certificate never arrives.

**This record stays for good.** AWS looks for it again every year to renew the certificate.

### Step 4. Wait for the certificate

```
aws acm wait certificate-validated \
  --certificate-arn "$CERT_ARN" \
  --region us-east-1
```

It returns when the certificate is issued: a few minutes, sometimes half an hour. To see
where it stands:

```
aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region us-east-1 \
  --query 'Certificate.Status'
```

`ISSUED` is the answer to wait for. Still `PENDING_VALIDATION` after an hour: look at the
record of step 3 again.

### Step 5. The second DNS record: the one that makes the name work

The distribution's own name is the stack's output `DistributionDomain`:

```
aws cloudformation describe-stacks \
  --stack-name shared-calendar-web \
  --region eu-north-1 \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionDomain'].OutputValue" \
  --output text
```

(On a stack released before the commit above that output does not exist yet: take the host
of the output `PageUrl`, without `https://`.)

Add a second record:

| Field | What to enter |
|---|---|
| Type | CNAME |
| Name | `calendar` |
| Value | the distribution's name, `dxxxxxxxx.cloudfront.net`, without `https://` and without a final `/` |
| TTL | the default |

Add it **before** the release of step 7: the release ends with four checks that ask the new
name, and they fail while the record is missing. Between this step and the release the name
answers with a refusal, which harms nobody: no one uses it yet.

To see that the record is there:

```
node -e 'require("dns").promises.resolveCname("calendar.example.com").then(console.log, e => console.log(e.code))'
```

### Step 6. The deploy gate: a clean tree and a fresh `verify`

The release refuses to run otherwise (`docs/RUNBOOK.md` section 2).

1. Everything committed, and `git status --short` printing nothing. A scratch file in the
   repository blocks the release: see section 7.
2. The local stack running, then:

   ```
   DYNAMODB_PORT=8002 npm run verify
   ```

   Its stamp is good for 30 minutes.

### Step 7. The release, with the name and the certificate

To see first what it would do, changing nothing, add `-- --dry-run` at the end.

```
PAGE_DOMAIN=calendar.example.com \
PAGE_CERTIFICATE_ARN="$CERT_ARN" \
  npm run deploy -w frontend
```

- SAM shows a change set. It should modify the distribution and nothing else. Confirm it.
- The distribution takes a few minutes to change.
- The files are uploaded, CloudFront's copies are emptied, and four checks run against
  `https://calendar.example.com`. Four PASS is the proof.

The two values are given this one time. They are in no committed file: the stack keeps them.

### Step 8. Check by hand

```
curl -sI https://calendar.example.com/ | head -n 1
curl -s -o /dev/null -w '%{http_code}\n' https://calendar.example.com/api/calendar
```

The first says `200`, the second `401` (the API answering, nobody signed in). Then in a
browser: open the address, sign in, sign out. The sign-out talks to Cognito from the page's
address, so it is worth seeing once at the new one.

## 5. The two DNS records, side by side

| | The proof | The address |
|---|---|---|
| Type | CNAME | CNAME |
| Name, as typed | `_abc123.calendar` | `calendar` |
| Points at | `_def456.acm-validations.aws` | `dxxxxxxxx.cloudfront.net` |
| What it does | Tells AWS the domain is yours, so that it issues the certificate and renews it | Sends a browser that asks for the name to the page's distribution |
| When | Before the certificate (step 3) | Before the release (step 5) |
| How long | For good | As long as the name is used |
| If it is deleted | The certificate is not renewed, and a year later browsers refuse the page | The name stops answering at once |

## 6. Afterwards

- **A later release** is the plain command; the stack keeps the name and the certificate:

  ```
  npm run deploy -w frontend
  ```

  The first plain release after this procedure is the first proof of that for this stack:
  look at the change set (it should not touch the alias) and at the four checks, which must
  ask the name of our own.
- **The old address still answers.** `https://<id>.cloudfront.net` shows the same page. Give
  people the new one.
- **The certificate renews itself**, as long as the first DNS record exists.
- **If the stack is deleted and created again**, the distribution gets a new name: the second
  DNS record must be changed to it, and the release must be given the two values again.
- **Another name in the place of this one:** the same procedure with the new name (a new
  certificate with its proof record, a new second record, one release with the two new
  values). The old name then stops answering and its two DNS records can be deleted. Not
  tried.
- **Going back to no name is not built.** The deploy command can give the two values but not
  take them away: when they are absent or empty it leaves the stack's values as they are,
  which is what lets a plain release keep the name. Removing the name needs a small change
  to `frontend/scripts/deploy.sh` first.

## 7. What must not be committed

The ARN holds the AWS account number, and the repository is public. The number is not a
secret (nobody can sign in with it), but it is better kept out of new files.

- The ARN goes in the environment of the one command, never in a committed file.
- A scratch file that holds it (notes, a command's saved answer) blocks the deploy gate while
  it is untracked. Keep such files outside the repository, or name them in
  `.git/info/exclude`: an ignore list that stays on this machine and is never committed.
- Never `git add -f` such a file.

## 8. When something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| "AccessDenied … service control policy" at step 1 | The organization blocks ACM in `us-east-1` | Ask for an exception; there is no other region for this |
| The certificate stays `PENDING_VALIDATION` | The first record is wrong, most often the domain written twice | Correct the record's name (step 3) |
| "Deploy refused" naming the tree or the stamp | The deploy gate | Commit or move the files away; run `verify` again |
| "PAGE_DOMAIN and PAGE_CERTIFICATE_ARN go together" | One of the two is empty, often a `CERT_ARN` not set in this terminal | Set both |
| The change set fails on the distribution | The certificate is not issued, is not in `us-east-1`, or is for another name | The stack goes back to what it was; correct and release again |
| The four checks FAIL with status `000` | The second record is missing, or not yet known to this machine | Add or correct it (step 5), then release again: nothing else is redone |
| The browser warns about the certificate | The name typed is not the one the certificate is for | The certificate covers exactly one name |

## 9. What changed in the repository, and what did not

**Changed** (commit `4ee5065`):

- `frontend/template.yaml`: two optional parameters, `PageDomain` and `PageCertificateArn`.
  With both given, the distribution answers under the name with that certificate (no version
  of TLS older than 1.2) and the output `PageUrl` is the name. New output
  `DistributionDomain`. With neither, the stack is as before.
- `frontend/scripts/deploy.sh`: takes the two values from the environment (`PAGE_DOMAIN`,
  `PAGE_CERTIFICATE_ARN`), both or neither, and refuses a malformed one before anything is
  deployed.
- `frontend/samconfig.toml`: a comment.

**Not changed:** the back end, `shared/`, the page's code. The page and the API still share
one address, so there is still no CORS.

**Not yet brought into line:** `docs/FRONTEND_ARCHITECTURE.md` still says there is no domain
of our own and that the organization blocks `us-east-1` (its open point O10, decision 143,
sections 13.1, 13.2, 13.6 and 13.8); `README.md`, `docs/RUNBOOK.md` and `CLAUDE.md` do not
name the new address or the two variables.

## 10. As seen on 2026-11-22

The release was run by the operator; the stack `shared-calendar-web` reached
`UPDATE_COMPLETE` at 13:10 UTC. Read afterwards with curl and no credentials, at
`https://calendar.enricopiccinin.com`:

- `/` answers 200 with the Content-Security-Policy and the three other headers, as at the
  old address;
- `/app.js` answers 200 as JavaScript; `/api/calendar` answers 401 and `/api/no-such-route`
  404, both with the API's JSON;
- plain `http://` is redirected to `https://` (301); the certificate is accepted;
- the address `https://<id>.cloudfront.net` still answers 200.

Reported working by the operator in a browser. Not looked at by this document's author: the
sign-in and the sign-out at the new address, and a later plain release keeping the name.
