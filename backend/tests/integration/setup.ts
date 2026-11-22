import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  type BatchWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';

// Helpers for the integration journeys (docs/IMPLEMENTATION_PLAN.md step 9). They talk to the local
// stack of docs/ARCHITECTURE.md section 8: `npm run local:up` (emulators) and `npm run local:api`
// (sam local). Unlike the handlers, tests may use the AWS SDK directly.

export const API_URL = 'http://127.0.0.1:3000';
const COGNITO_URL = 'http://localhost:9229';
const DYNAMODB_PORT = process.env.DYNAMODB_PORT ?? '8000';
const DYNAMODB_URL = `http://localhost:${DYNAMODB_PORT}`;
const TABLE_NAME = 'hello-messages';
const CALENDAR_TABLE = 'calendar';
const ASSISTANT_TABLE = 'assistant';
const ENV_FILE = 'env.local.json';
// What `npm run local:up` writes into env.local.json when it wires the fake Claude of the Docker
// stack (scripts/local-seed.sh), and the port the fake listens on.
const FAKE_CLAUDE_BASE_URL = 'http://fake-claude:9230';
const FAKE_CLAUDE_KEY = 'not-a-key-the-fake-claude-checks-none';
const FAKE_CLAUDE_PORT = 9230;

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

async function tableExists(name: string): Promise<boolean> {
  try {
    await dynamoClient.send(new DescribeTableCommand({ TableName: name }));
    return true;
  } catch {
    return false;
  }
}

// Why the journeys must not run, or null when the local stack is wired to the fake Claude. No
// journey ever talks to the real Claude: it would cost money and answer differently every time
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 12.2). One rule for every journey, the calendar's
// too. The file is what `npm run local:api` read when it started, hence the restart in the message.
export function claudeWiringProblem(): string | null {
  const parameters = (JSON.parse(readFileSync(ENV_FILE, 'utf8')) as { Parameters?: Record<string, string> }).Parameters ?? {};
  if (parameters.ANTHROPIC_BASE_URL === FAKE_CLAUDE_BASE_URL && parameters.ANTHROPIC_API_KEY === FAKE_CLAUDE_KEY) return null;
  return (
    `${ENV_FILE} does not wire the fake Claude: the journeys never run against the real Claude. ` +
    'Run npm run local:up in a shell where ANTHROPIC_API_KEY is not set, then restart npm run local:api ' +
    '(it reads the file only when it starts)'
  );
}

// Whether env.local.json wires the real Claude: no other address than Anthropic's own, and a key
// that is not the fake's placeholder. The evaluation with the real model asks this
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 12.3); the key itself is never given back.
export function realClaudeWired(): boolean {
  const parameters = (JSON.parse(readFileSync(ENV_FILE, 'utf8')) as { Parameters?: Record<string, string> }).Parameters ?? {};
  return !parameters.ANTHROPIC_BASE_URL && Boolean(parameters.ANTHROPIC_API_KEY) && parameters.ANTHROPIC_API_KEY !== FAKE_CLAUDE_KEY;
}

// vitest globalSetup: fail fast, with the command to run, when the local stack is not up.
export async function setup(): Promise<void> {
  const missing: string[] = [];
  if (!existsSync(ENV_FILE)) {
    missing.push(`${ENV_FILE} is missing (npm run local:up)`);
  } else {
    const problem = claudeWiringProblem();
    if (problem !== null) missing.push(problem);
  }
  if (!(await portOpen(Number(DYNAMODB_PORT)))) {
    missing.push(`DynamoDB Local is not listening on port ${DYNAMODB_PORT} (npm run local:up; set DYNAMODB_PORT if it uses another port)`);
  } else if (!(await tableExists(TABLE_NAME))) {
    // Typically another project's DynamoDB Local holds the port (DYNAMODB_PORT not set).
    missing.push(`no table ${TABLE_NAME} on port ${DYNAMODB_PORT}: wrong DYNAMODB_PORT, or run npm run local:up`);
  } else if (!(await tableExists(CALENDAR_TABLE))) {
    // A stack started before the calendar table existed: local:up creates it (it is idempotent).
    missing.push(`no table ${CALENDAR_TABLE} on port ${DYNAMODB_PORT}: run npm run local:up again`);
  } else if (!(await tableExists(ASSISTANT_TABLE))) {
    missing.push(`no table ${ASSISTANT_TABLE} on port ${DYNAMODB_PORT}: run npm run local:up again`);
  }
  if (!(await portOpen(9229))) missing.push('cognito-local is not listening on port 9229 (npm run local:up)');
  if (!(await portOpen(FAKE_CLAUDE_PORT))) missing.push(`the fake Claude is not listening on port ${FAKE_CLAUDE_PORT} (npm run local:up)`);
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

// ── The calendar table (docs/SHARED_CALENDAR_SPEC.md 18.2) ────────────────────────────────────
// The calendar is global, so the calendar journeys own the local table: they empty it first.

export type CalendarItem = { PK: string; SK: string } & Record<string, unknown>;

// These helpers write straight into the table, so they refuse anything but the local emulator.
async function localCalendar(): Promise<DynamoDBDocumentClient> {
  const endpoint = await dynamoClient.config.endpoint?.();
  const host = endpoint?.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to touch the calendar table on ${host ?? 'the default AWS endpoint'}: only DynamoDB Local`);
  }
  return dynamo;
}

// Deletes every item of the local calendar table, including what an earlier failed run left.
export async function resetCalendarTable(): Promise<void> {
  const client = await localCalendar();
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await client.send(
      new ScanCommand({ TableName: CALENDAR_TABLE, ProjectionExpression: 'PK, SK', ExclusiveStartKey: startKey }),
    );
    const keys = (page.Items ?? []) as { PK: string; SK: string }[];
    for (let i = 0; i < keys.length; i += 25) {
      const requests = keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } }));
      let unprocessed: BatchWriteCommandInput['RequestItems'] = { [CALENDAR_TABLE]: requests };
      while (unprocessed && Object.keys(unprocessed).length > 0) {
        unprocessed = (await client.send(new BatchWriteCommand({ RequestItems: unprocessed }))).UnprocessedItems;
      }
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey);
}

// Writes an item directly, for states the API cannot produce (e.g. an appointment in the past).
export async function putCalendarItem(item: CalendarItem): Promise<void> {
  const client = await localCalendar();
  await client.send(new PutCommand({ TableName: CALENDAR_TABLE, Item: item }));
}

// One item read directly (consistent), or undefined.
export async function getCalendarItem(PK: string, SK: string): Promise<CalendarItem | undefined> {
  const client = await localCalendar();
  const { Item } = await client.send(new GetCommand({ TableName: CALENDAR_TABLE, Key: { PK, SK }, ConsistentRead: true }));
  return Item as CalendarItem | undefined;
}

// Deletes one item directly (e.g. a deleted-user marker a journey wrote with putCalendarItem).
export async function deleteCalendarItem(PK: string, SK: string): Promise<void> {
  const client = await localCalendar();
  await client.send(new DeleteCommand({ TableName: CALENDAR_TABLE, Key: { PK, SK } }));
}

// Every item of one partition (consistent), in SK order, following LastEvaluatedKey.
export async function queryCalendarPartition(PK: string): Promise<CalendarItem[]> {
  const client = await localCalendar();
  const items: CalendarItem[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await client.send(
      new QueryCommand({
        TableName: CALENDAR_TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': PK },
        ConsistentRead: true,
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...((page.Items ?? []) as CalendarItem[]));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

// ── The assistant (docs/ARCHITECTURE.md section 4, "The assistant's routes") ──────────────────

// The messages a person may send to the assistant in a day on the local stack: what
// `npm run local:up` wrote into env.local.json (scripts/local-seed.sh).
export function localDailyMessageLimit(): number {
  const parameters = (JSON.parse(readFileSync(ENV_FILE, 'utf8')) as { Parameters: Record<string, string> }).Parameters;
  return Number(parameters.ASSISTANT_DAILY_MESSAGE_LIMIT);
}

// The `sub` of an access token: the name under which the person's conversation is stored. Read
// from the token's middle part, without checking the signature; for looking up stored items only.
export function subOf(token: string): string {
  const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { sub: string };
  return payload.sub;
}

export type AssistantItem = { PK: string; SK: string } & Record<string, unknown>;

// Every item of one partition of the local assistant table (consistent), in SK order.
export async function queryAssistantPartition(PK: string): Promise<AssistantItem[]> {
  const client = await localCalendar();
  const items: AssistantItem[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await client.send(
      new QueryCommand({
        TableName: ASSISTANT_TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': PK },
        ConsistentRead: true,
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...((page.Items ?? []) as AssistantItem[]));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

// The entries of the person's conversation in progress that Claude is given, as stored: each
// message item of that conversation, in order, its content read as the JSON text it is kept as.
// A notice, which only the person reads, is left out, and so are the messages of the person's
// earlier conversations, which the partition also holds.
export async function storedEntries(token: string): Promise<{ role: string; content: unknown }[]> {
  const items = await queryAssistantPartition(`CONV#${subOf(token)}`);
  const id = items.find((item) => item.SK === 'META')?.conversationId as string;
  return items.filter((item) => item.SK.startsWith(`MSG#${id}#`) && item.kind === 'model').map((item) => JSON.parse(item.content as string) as { role: string; content: unknown });
}

// Forgets what a person used of the assistant so far, by deleting the items that count it. For the
// seeded accounts only: they keep their `sub` from one run to the next, so without this a day of
// runs would use up their messages. One of the two writes a journey makes to this table directly;
// the other is setStoredPromptVersion.
export async function forgetDailyUse(sub: string): Promise<void> {
  const client = await localCalendar();
  for (const item of await queryAssistantPartition(`USAGE#${sub}`)) {
    await client.send(new DeleteCommand({ TableName: ASSISTANT_TABLE, Key: { PK: item.PK, SK: item.SK } }));
  }
}

// Writes another mark of the instructions and tools on the person's conversation in progress: the
// state a deployment that changes them leaves behind, which no route can produce
// (docs/CONVERSATIONAL_ARCHITECTURE.md section 4.3). Refused when the person has no stored
// conversation. The other write a journey makes to this table directly.
export async function setStoredPromptVersion(sub: string, promptVersion: string): Promise<void> {
  const client = await localCalendar();
  await client.send(
    new UpdateCommand({
      TableName: ASSISTANT_TABLE,
      Key: { PK: `CONV#${sub}`, SK: 'META' },
      UpdateExpression: 'SET promptVersion = :mark',
      ConditionExpression: 'attribute_exists(PK) AND attribute_type(conversationId, :string)',
      ExpressionAttributeValues: { ':mark': promptVersion, ':string': 'S' },
    }),
  );
}

// ── What a step of the assistant costs the table ──────────────────────────────────────────────
// For the measurements of docs/CONVERSATIONAL_ARCHITECTURE.md section 9. Nothing here is asserted
// by a journey: DynamoDB Local is an emulator, and its count is not a contract.

// The size of an item as DynamoDB counts it for capacity: the UTF-8 bytes of each attribute name
// and of each string, about one byte per two digits of a number plus one, one byte for a null or
// a boolean, and three bytes for a list or a map plus one for each of its elements.
export function itemBytes(item: Record<string, unknown>): number {
  const valueBytes = (value: unknown): number => {
    if (typeof value === 'string') return Buffer.byteLength(value, 'utf8');
    if (typeof value === 'number') return Math.ceil(String(Math.abs(value)).replace(/[^0-9]/g, '').replace(/^0+|0+$/g, '').length / 2) + 1;
    if (value === null || typeof value === 'boolean') return 1;
    if (Array.isArray(value)) return 3 + value.reduce<number>((bytes, element) => bytes + 1 + valueBytes(element), 0);
    return 3 + Object.entries(value as Record<string, unknown>).reduce((bytes, [name, element]) => bytes + 1 + Buffer.byteLength(name, 'utf8') + valueBytes(element), 0);
  };
  return Object.entries(item).reduce((bytes, [name, value]) => bytes + Buffer.byteLength(name, 'utf8') + valueBytes(value), 0);
}

// What the person's conversation in progress weighs in the table, and what DynamoDB Local says the
// three reads of a step consume on it: the same reads on the same keys as the functions make,
// strongly consistent, asked again here with the consumed capacity.
export type AssistantWeight = {
  storedBytes: number;
  version: number;
  metaBytes: number;
  // The size of each message item of the conversation, by its sort key.
  messageBytes: Record<string, number>;
  // The person's use of the day as stored (the latest date), and its size.
  usage: Record<string, unknown> | null;
  usageBytes: number;
  readUnits: { meta: number; messages: number; usage: number };
};

export async function weighAssistant(sub: string): Promise<AssistantWeight> {
  const client = await localCalendar();
  const consumed = { ReturnConsumedCapacity: 'TOTAL' } as const;
  const meta = await client.send(new GetCommand({ TableName: ASSISTANT_TABLE, Key: { PK: `CONV#${sub}`, SK: 'META' }, ConsistentRead: true, ...consumed }));
  const messageBytes: Record<string, number> = {};
  let messageUnits = 0;
  const conversationId = meta.Item?.conversationId as string | null | undefined;
  if (conversationId) {
    let startKey: Record<string, unknown> | undefined;
    do {
      const page = await client.send(
        new QueryCommand({
          TableName: ASSISTANT_TABLE,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': `CONV#${sub}`, ':prefix': `MSG#${conversationId}#` },
          ConsistentRead: true,
          ExclusiveStartKey: startKey,
          ...consumed,
        }),
      );
      for (const item of page.Items ?? []) messageBytes[item.SK as string] = itemBytes(item);
      messageUnits += page.ConsumedCapacity?.CapacityUnits ?? 0;
      startKey = page.LastEvaluatedKey;
    } while (startKey);
  }
  const days = await queryAssistantPartition(`USAGE#${sub}`);
  const day = days.at(-1);
  const usage = day ? await client.send(new GetCommand({ TableName: ASSISTANT_TABLE, Key: { PK: day.PK, SK: day.SK }, ConsistentRead: true, ...consumed })) : null;
  return {
    storedBytes: conversationId ? (meta.Item?.storedBytes as number) : 0,
    version: (meta.Item?.version as number | undefined) ?? 0,
    metaBytes: meta.Item ? itemBytes(meta.Item) : 0,
    messageBytes,
    usage: usage?.Item ?? null,
    usageBytes: usage?.Item ? itemBytes(usage.Item) : 0,
    readUnits: { meta: meta.ConsumedCapacity?.CapacityUnits ?? 0, messages: messageUnits, usage: usage?.ConsumedCapacity?.CapacityUnits ?? 1 },
  };
}

// One request to the assistant as the table saw it: what it read (the conversation as it was
// before) and what it wrote, worked out from the items that are new or changed afterwards.
export type AssistantStepCost = {
  step: string;
  storedBytes: number;
  readBytes: number;
  readUnits: number;
  itemsWritten: number;
  writtenBytes: number;
  largestItemBytes: number;
  writeUnits: number;
};

const KB = 1024;

// The write units by AWS's rule: each item written counts its size rounded up to the next
// kilobyte, the larger of before and after for an item that existed, and twice that inside a
// transaction. The step that ends a conversation is the one write that is no transaction.
export function assistantStepCost(step: string, before: AssistantWeight, after: AssistantWeight, transaction = true): AssistantStepCost {
  const written: number[] = [];
  if (after.version !== before.version) written.push(Math.max(before.metaBytes, after.metaBytes));
  for (const [sk, bytes] of Object.entries(after.messageBytes)) if (!(sk in before.messageBytes)) written.push(bytes);
  if (JSON.stringify(after.usage) !== JSON.stringify(before.usage)) written.push(Math.max(before.usageBytes, after.usageBytes));
  const readBytes = before.metaBytes + Object.values(before.messageBytes).reduce((sum, bytes) => sum + bytes, 0) + before.usageBytes;
  return {
    step,
    storedBytes: after.storedBytes,
    readBytes,
    readUnits: before.readUnits.meta + before.readUnits.messages + before.readUnits.usage,
    itemsWritten: written.length,
    writtenBytes: written.reduce((sum, bytes) => sum + bytes, 0),
    largestItemBytes: Math.max(0, ...written),
    writeUnits: (transaction ? 2 : 1) * written.reduce((sum, bytes) => sum + Math.ceil(bytes / KB), 0),
  };
}

// Appends the measured steps, one JSON line each, to the file named by ASSISTANT_CAPACITY_FILE.
// Without the variable nothing is written: the gate leaves no file behind.
export function reportAssistantCosts(costs: AssistantStepCost[]): void {
  const file = process.env.ASSISTANT_CAPACITY_FILE;
  if (file) appendFileSync(file, costs.map((cost) => `${JSON.stringify(cost)}\n`).join(''));
}

// Creates an account that is in neither group, straight in cognito-local: a state the API cannot
// produce, since POST /users always puts the new user in the group `user`. The password is set as
// permanent, as everywhere. Remove the account with removeUserIfPresent.
export async function createUserInNoGroup(username: string, password: string): Promise<void> {
  const UserPoolId = localPool().userPoolId;
  await cognito.send(new AdminCreateUserCommand({ UserPoolId, Username: username, MessageAction: 'SUPPRESS' }));
  await cognito.send(new AdminSetUserPasswordCommand({ UserPoolId, Username: username, Password: password, Permanent: true }));
}
