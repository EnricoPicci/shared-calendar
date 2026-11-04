// The two Cognito calls of the operator scripts that carry a password, with the password read
// from stdin. Shell scripts cannot make these calls safely: the AWS CLI takes a request only as
// command-line arguments (visible in ps) or as a regular file (on disk), and its errors echo
// the input. The AWS SDK, already a dependency, signs requests and finds the AWS login itself.
//
//   node scripts/cognito.mjs sign-in <clientId> <username>       prints the access token
//   node scripts/cognito.mjs set-password <poolId> <username>    sets it as permanent
//
// COGNITO_URL points the client at cognito-local; without it the SDK uses the real endpoint of
// AWS_REGION. Errors print "<name> <message>" (never the password) and exit 1.
import {
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { readFileSync } from 'node:fs';

const [action, id, username] = process.argv.slice(2);
if (!['sign-in', 'set-password'].includes(action ?? '') || !id || !username) {
  console.error('usage: node scripts/cognito.mjs <sign-in|set-password> <clientId|poolId> <username>');
  process.exit(2);
}

const password = readFileSync(0, 'utf8');
const client = new CognitoIdentityProviderClient(process.env.COGNITO_URL ? { endpoint: process.env.COGNITO_URL } : {});

try {
  if (action === 'sign-in') {
    const result = await client.send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: id,
        AuthParameters: { USERNAME: username, PASSWORD: password },
      }),
    );
    const token = result.AuthenticationResult?.AccessToken;
    if (!token) throw Object.assign(new Error(`answered with the challenge ${result.ChallengeName}`), { name: 'Challenge' });
    process.stdout.write(`${token}\n`);
  } else {
    await client.send(
      new AdminSetUserPasswordCommand({ UserPoolId: id, Username: username, Password: password, Permanent: true }),
    );
  }
} catch (err) {
  console.error(`${err.name} ${err.message}`);
  process.exit(1);
}
