import {
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';

// Helpers for the integration journeys (plan step 9). They talk to the local stack of
// architecture section 8: `npm run local:up` (emulators) and `npm run local:api` (sam local).
// Unlike the handlers, tests may use the AWS SDK directly.

const API_URL = 'http://127.0.0.1:3000';
const COGNITO_URL = 'http://localhost:9229';
const DYNAMODB_PORT = process.env.DYNAMODB_PORT ?? '8000';
const DYNAMODB_URL = `http://localhost:${DYNAMODB_PORT}`;
const TABLE_NAME = 'hello-messages';
const ENV_FILE = 'env.local.json';

// Dummy credentials: the emulators accept anything, and this keeps the SDK away from the real
// AWS login of this machine.
const LOCAL = { region: 'eu-west-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } };

const cognito = new CognitoIdentityProviderClient({ ...LOCAL, endpoint: COGNITO_URL });
const dynamoClient = new DynamoDBClient({ ...LOCAL, endpoint: DYNAMODB_URL });
const dynamo = DynamoDBDocumentClient.from(dynamoClient);

// Read lazily: globalSetup imports this module before it has checked that the file exists.
let pool: { userPoolId: string; clientId: string } | undefined;
function localPool() {
  if (!pool) {
    const env = JSON.parse(readFileSync(ENV_FILE, 'utf8')) as {
      AuthorizerFunction: { USER_POOL_ID: string; CLIENT_ID: string };
    };
    pool = { userPoolId: env.AuthorizerFunction.USER_POOL_ID, clientId: env.AuthorizerFunction.CLIENT_ID };
  }
  return pool;
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port, timeout: 1000 });
    const finish = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function tableExists(): Promise<boolean> {
  try {
    await dynamoClient.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    return true;
  } catch {
    return false;
  }
}

// vitest globalSetup: fail fast, with the command to run, when the local stack is not up.
export async function setup(): Promise<void> {
  const missing: string[] = [];
  if (!existsSync(ENV_FILE)) missing.push(`${ENV_FILE} is missing (npm run local:up)`);
  if (!(await portOpen(Number(DYNAMODB_PORT)))) {
    missing.push(`DynamoDB Local is not listening on port ${DYNAMODB_PORT} (npm run local:up; set DYNAMODB_PORT if it uses another port)`);
  } else if (!(await tableExists())) {
    // Typically another project's DynamoDB Local holds the port (DYNAMODB_PORT not set).
    missing.push(`no table ${TABLE_NAME} on port ${DYNAMODB_PORT}: wrong DYNAMODB_PORT, or run npm run local:up`);
  }
  if (!(await portOpen(9229))) missing.push('cognito-local is not listening on port 9229 (npm run local:up)');
  if (!(await portOpen(3000))) missing.push('the API is not listening on port 3000 (npm run local:api)');
  if (missing.length > 0) {
    // Printed as well as thrown: vitest 5 crashes while formatting an error thrown from a
    // globalSetup (TypeError: code.charCodeAt is not a function) and the message is lost.
    const message = `Integration tests need the local stack:\n  - ${missing.join('\n  - ')}`;
    console.error(`\n${message}\n`);
    throw new Error(message);
  }
}

// Returns the access token. Throws if Cognito answers with a challenge instead of tokens.
// The error never contains the password or a token.
export async function signIn(username: string, password: string): Promise<string> {
  const result = await cognito.send(
    new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: localPool().clientId,
      AuthParameters: { USERNAME: username, PASSWORD: password },
    }),
  );
  if (result.ChallengeName) throw new Error(`Sign-in as ${username} returned the challenge ${result.ChallengeName}`);
  const token = result.AuthenticationResult?.AccessToken;
  if (!token) throw new Error(`Sign-in as ${username} returned no access token`);
  return token;
}

export type ApiResponse = { status: number; body: Record<string, unknown> | undefined };

// body is the parsed JSON answer, or undefined when the answer is empty (204).
export async function api(method: string, path: string, token?: string, body?: unknown): Promise<ApiResponse> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!text) return { status: res.status, body: undefined };
  try {
    return { status: res.status, body: JSON.parse(text) as Record<string, unknown> };
  } catch {
    throw new Error(`${method} ${path} answered ${res.status} with a body that is not JSON`);
  }
}

// Every row of the hello-messages table, read directly from DynamoDB Local.
export async function scanMessages(): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await dynamo.send(new ScanCommand({ TableName: TABLE_NAME, ExclusiveStartKey: startKey }));
    items.push(...(page.Items ?? []));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

// Removes a leftover throw-away user from an earlier, interrupted run. Goes straight to
// cognito-local, not through the API. Never call it for admin or alice.
export async function removeUserIfPresent(username: string): Promise<void> {
  try {
    await cognito.send(new AdminDeleteUserCommand({ UserPoolId: localPool().userPoolId, Username: username }));
  } catch (err) {
    if ((err as { name?: unknown }).name !== 'UserNotFoundException') throw err;
  }
}
