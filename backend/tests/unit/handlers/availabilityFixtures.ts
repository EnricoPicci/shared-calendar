import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { aliceItem, claimsOf, NOW, typeItems } from './patternFixtures';

// Shared by the override and one-off window handlers' tests (setOverride, deleteOverride,
// createOneOffWindow, deleteOneOffWindow). The dates of docs/SHARED_CALENDAR_SPEC.md section 18.3:
// now 2026-11-10T09:00Z, a Tuesday, Europe/Rome (UTC+1 in November); the pattern of
// docs/SHARED_CALENDAR_SPEC.md AC-04, Mon 08:00–12:00 Studio.

export * from './patternFixtures';

export const YESTERDAY = '2026-11-09';
export const TODAY = '2026-11-10';
export const MONDAY = '2026-11-16';
export const W1 = '01JC00000000000000000000W1';
export const W2 = '01JC00000000000000000000W2';

/** An event with any path parameters (`{ date }`, `{ windowId }`) and an optional raw body. */
export function eventAt(
  route: string,
  lambda: Record<string, string> | undefined,
  pathParameters: Record<string, string> | undefined,
  body?: string,
): APIGatewayProxyEventV2 {
  return {
    routeKey: route,
    requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) },
    pathParameters,
    body,
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}
export const admin = claimsOf('admin', ['admin']);

/** A one-off window item as stored (WINDOW / <date>#<windowId>). */
export const windowItem = (windowId: string, date: string, start: string, end: string, typeId: string) => ({
  PK: 'WINDOW',
  SK: `${date}#${windowId}`,
  date,
  start,
  end,
  typeId,
  createdAt: NOW,
  createdBy: { username: 'admin', role: 'admin' },
});
/** An override item as stored (OVERRIDE / <date>). */
export const overrideItem = (date: string, windows: object[]) => ({
  PK: 'OVERRIDE',
  SK: date,
  windows,
  updatedAt: NOW,
  updatedBy: { username: 'admin', role: 'admin' },
});
/** Bob's appointment the same Monday, 10:00–11:00 local, stored before alice's on purpose. */
export const bobItem = {
  ...aliceItem,
  SK: '2026-11-16T09:00:00.000Z#A2',
  username: 'bob',
  start: '2026-11-16T09:00:00.000Z',
  end: '2026-11-16T10:00:00.000Z',
};

/** The mocked DynamoDB, the captured log output and the helpers every one of these tests uses. */
export function harness() {
  const ddb = mockClient(DynamoDBDocumentClient);
  const output: string[] = [];
  const onPartition = (pk: string, items: object[]) => ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': pk } }).resolves({ Items: items });
  const reset = () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    ddb.reset();
    ddb.on(GetCommand).resolves({});
    ddb.on(QueryCommand).resolves({ Items: [] });
    onPartition('TYPE', typeItems);
    ddb.on(TransactWriteCommand).resolves({});
    output.length = 0;
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
  };
  return {
    ddb,
    output,
    reset,
    onPartition,
    logLines: () => output.map((line) => JSON.parse(line) as Record<string, unknown>),
    transactions: () => ddb.commandCalls(TransactWriteCommand).map((call) => call.args[0].input),
  };
}

export const bodyOf = (response: { body?: string }) => JSON.parse(response.body ?? '') as Record<string, unknown>;

export function cleanUp() {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
}
