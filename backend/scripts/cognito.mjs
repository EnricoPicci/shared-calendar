// The Cognito calls of the operator scripts that carry a password or a token, with every secret
// read from stdin. Shell scripts cannot make these calls safely: the AWS CLI takes a request only
// as command-line arguments (visible in ps) or as a regular file (on disk), and its errors echo
// the input. The AWS SDK, already a dependency, signs requests and finds the AWS login itself.
//
//   node scripts/cognito.mjs sign-in <clientId> <username>       password -> the access token
//   node scripts/cognito.mjs tokens <clientId> <username>        password -> the access token and
//                                                                 the refresh token, one per line
//   node scripts/cognito.mjs refresh <clientId>                  refresh token -> nothing; exit 0
//                                                                 when Cognito still accepts it
//   node scripts/cognito.mjs change-password                     three lines: the access token,
//                                                                 the current password, the new one
//   node scripts/cognito.mjs sign-out                            access token -> GlobalSignOut,
//                                                                 every token of the person revoked
//   node scripts/cognito.mjs set-password <poolId> <username>    password -> set as permanent
//   node scripts/cognito.mjs set-profile <poolId> <username>     a person's four facts, one per
//                                                                 line: first name, last name,
//                                                                 e-mail, then the postal address,
//                                                                 whose lines are all the rest
//
// The facts are no secret, but they are personal data (docs/EMAIL_ARCHITECTURE.md section 12.3):
// stdin keeps them out of ps and off the disk, like a password. They are checked first by the rule
// of shared/src/user.ts, written again here because a script cannot import TypeScript; the API's
// own check stays the one the page and the routes use.
//
// A password holds no line break (docs/ARCHITECTURE.md section 6.9: no blank character at all)
// and a token neither, so the three secrets of change-password are told apart by their line;
// any other number of lines is refused. change-password and sign-out are two calls, so that a
// caller can check between them what ChangePassword alone leaves valid. Locally there is no
// sign-out to call: cognito-local does not implement GlobalSignOut (docs/ARCHITECTURE.md
// section 8), and the caller skips it.
//
// COGNITO_URL points the client at cognito-local; without it the SDK uses the real endpoint of
// AWS_REGION. Errors print "<name> <message>" and exit 1; every secret read from stdin is blanked
// out of the message, should Cognito ever quote one. Nothing else is printed.
import {
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  ChangePasswordCommand,
  CognitoIdentityProviderClient,
  GlobalSignOutCommand,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { readFileSync } from 'node:fs';

// The arguments each action takes after its name.
const ARGUMENTS = {
  'sign-in': ['clientId', 'username'],
  tokens: ['clientId', 'username'],
  refresh: ['clientId'],
  'change-password': [],
  'sign-out': [],
  'set-password': ['poolId', 'username'],
  'set-profile': ['poolId', 'username'],
};

const [action, ...args] = process.argv.slice(2);
const expected = Object.hasOwn(ARGUMENTS, action ?? '') ? ARGUMENTS[action] : undefined;
if (!expected || args.length !== expected.length || args.some((arg) => !arg)) {
  console.error(
    'usage: node scripts/cognito.mjs <sign-in|tokens> <clientId> <username> | refresh <clientId> | ' +
      'change-password | sign-out | <set-password|set-profile> <poolId> <username>   (secrets on stdin)',
  );
  process.exit(2);
}
const [id, username] = args;

// stdin as lines: one trailing line break is allowed, as printf '%s\n' writes it.
const input = readFileSync(0, 'utf8');
const lines = input.replace(/\n$/, '').split('\n');
const secrets = lines.filter((line) => line.length > 0);

const client = new CognitoIdentityProviderClient(process.env.COGNITO_URL ? { endpoint: process.env.COGNITO_URL } : {});

// The sign-in with a password; the answer's tokens, or a Challenge error when Cognito asks for more.
async function signIn(password) {
  const result = await client.send(
    new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: id,
      AuthParameters: { USERNAME: username, PASSWORD: password },
    }),
  );
  const tokens = result.AuthenticationResult;
  if (!tokens?.AccessToken) {
    throw Object.assign(new Error(`answered with the challenge ${result.ChallengeName}`), { name: 'Challenge' });
  }
  return tokens;
}

// The one secret of the actions that take one: the whole of stdin for a password (as it always
// was, so a password is read exactly as typed), the one line for a token.
function oneLine() {
  if (lines.length !== 1 || !lines[0]) {
    throw Object.assign(new Error('expected one line on stdin'), { name: 'Input' });
  }
  return lines[0];
}

// The four facts read from stdin, trimmed, the e-mail lower-cased, each checked by the rule of
// shared/src/user.ts (lengths in UTF-16 code units, as there): a name 1–100 characters on one
// line, an e-mail of at most 254 characters with the shape name@domain.tld, an address 1–300.
function profile() {
  // Three lines at least: an address left empty is refused below with the other facts' problems.
  if (lines.length < 3) {
    throw Object.assign(new Error('expected four facts on stdin: first name, last name, e-mail, address'), { name: 'Input' });
  }
  const [givenName, familyName, email] = lines.slice(0, 3).map((line) => line.trim());
  const address = lines.slice(3).join('\n').trim();
  const problems = [];
  for (const [name, value] of [['first name', givenName], ['last name', familyName]]) {
    if (value.length < 1 || value.length > 100 || /\p{Cc}/u.test(value)) problems.push(`the ${name} needs 1 to 100 characters`);
  }
  const lowered = email.toLowerCase();
  if (lowered.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lowered)) problems.push('the e-mail is not an address');
  if (address.length < 1 || address.length > 300 || /[^\P{Cc}\n]/u.test(address)) problems.push('the address needs 1 to 300 characters');
  if (problems.length > 0) throw Object.assign(new Error(problems.join('; ')), { name: 'Input' });
  return [
    { Name: 'given_name', Value: givenName },
    { Name: 'family_name', Value: familyName },
    { Name: 'email', Value: lowered },
    { Name: 'email_verified', Value: 'true' },
    { Name: 'address', Value: address },
  ];
}

try {
  if (action === 'sign-in') {
    process.stdout.write(`${(await signIn(input)).AccessToken}\n`);
  } else if (action === 'tokens') {
    const tokens = await signIn(input);
    if (!tokens.RefreshToken) throw Object.assign(new Error('answered without a refresh token'), { name: 'NoRefreshToken' });
    process.stdout.write(`${tokens.AccessToken}\n${tokens.RefreshToken}\n`);
  } else if (action === 'refresh') {
    const result = await client.send(
      new InitiateAuthCommand({ AuthFlow: 'REFRESH_TOKEN_AUTH', ClientId: id, AuthParameters: { REFRESH_TOKEN: oneLine() } }),
    );
    if (!result.AuthenticationResult?.AccessToken) {
      throw Object.assign(new Error('answered without an access token'), { name: 'NoAccessToken' });
    }
  } else if (action === 'change-password') {
    if (lines.length !== 3 || lines.some((line) => !line)) {
      throw Object.assign(new Error('expected three lines on stdin: access token, current password, new password'), {
        name: 'Input',
      });
    }
    const [accessToken, previous, proposed] = lines;
    await client.send(new ChangePasswordCommand({ AccessToken: accessToken, PreviousPassword: previous, ProposedPassword: proposed }));
  } else if (action === 'sign-out') {
    await client.send(new GlobalSignOutCommand({ AccessToken: oneLine() }));
  } else if (action === 'set-profile') {
    await client.send(new AdminUpdateUserAttributesCommand({ UserPoolId: id, Username: username, UserAttributes: profile() }));
  } else {
    await client.send(
      new AdminSetUserPasswordCommand({ UserPoolId: id, Username: username, Password: input, Permanent: true }),
    );
  }
} catch (err) {
  let text = `${err.name} ${err.message}`;
  for (const secret of [input, ...secrets]) if (secret) text = text.split(secret).join('<hidden>');
  console.error(text);
  process.exit(1);
}
