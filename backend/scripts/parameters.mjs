// The one write of a secret to Parameter Store made by the operator scripts, with the value read
// from stdin: the Anthropic API key of scripts/assistant-key.sh. A shell script cannot make this
// call safely: the AWS CLI takes the value only as a command-line argument (visible in ps) or as
// a file (on disk), and its errors echo the input. The AWS SDK, already a dependency, signs the
// request and finds the AWS login and the region (AWS_REGION) itself.
//
//   node scripts/parameters.mjs put-secret <name> <new|replace>
//
// Stores stdin as the SecureString <name>, encrypted with the account's default key for Parameter
// Store (aws/ssm, as no key is named). "new" refuses to touch a parameter that exists already,
// "replace" overwrites it, which makes a new version. Prints nothing on success. An error prints
// its name only, never its message, which could quote the value, and exits 1.
import { PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { readFileSync } from 'node:fs';

const [action, name, mode] = process.argv.slice(2);
if (action !== 'put-secret' || !name || !['new', 'replace'].includes(mode ?? '')) {
  console.error('usage: node scripts/parameters.mjs put-secret <name> <new|replace>');
  process.exit(2);
}

const value = readFileSync(0, 'utf8');
try {
  await new SSMClient({}).send(
    new PutParameterCommand({ Name: name, Value: value, Type: 'SecureString', Overwrite: mode === 'replace' }),
  );
} catch (err) {
  console.error(err instanceof Error ? err.name : 'UnknownError');
  process.exit(1);
}
