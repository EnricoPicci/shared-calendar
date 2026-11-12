import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// Shared by the pattern write handlers' tests (createPattern, updatePattern, deletePattern).
// AC-04: now 2026-11-10T09:00Z (Tuesday), Europe/Rome.

export const NOW = '2026-11-10T09:00:00.000Z';
export const EARLIER = '2026-11-01T08:00:00.000Z';
export const STUDIO = '01JC0000000000000000000001';
export const POOL = '01JC0000000000000000000002';
export const P1 = '01JC00000000000000000000P1';
export const UNKNOWN = '01JC0000000000000000000099';
export const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Pattern Mon 08:00–12:00 Studio from 2026-11-01, no end (AC-04): a valid PatternBody. */
export const AC04 = { weekday: 1, start: '08:00', end: '12:00', typeId: STUDIO, validFrom: '2026-11-01', validUntil: null };

export const typeItems = [
  { PK: 'TYPE', SK: STUDIO, name: 'Studio', nameKey: 'studio', createdAt: EARLIER, updatedAt: EARLIER },
  { PK: 'TYPE', SK: POOL, name: 'Pool', nameKey: 'pool', createdAt: EARLIER, updatedAt: EARLIER },
];
export const patternItem = (patternId: string, more: object = {}) => ({
  PK: 'PATTERN',
  SK: patternId,
  ...AC04,
  createdAt: EARLIER,
  updatedAt: EARLIER,
  ...more,
});
/** Alice's appointment, Monday 2026-11-16 09:00–10:00 local (AC-10), as stored. */
export const aliceItem = {
  PK: 'APPT',
  SK: '2026-11-16T08:00:00.000Z#A1',
  username: 'alice',
  start: '2026-11-16T08:00:00.000Z',
  end: '2026-11-16T09:00:00.000Z',
  date: '2026-11-16',
  typeId: STUDIO,
  status: 'booked',
  note: 'secret note',
};

export function eventWith(
  route: string,
  lambda: Record<string, string> | undefined,
  patternId: string | undefined,
  body?: string,
): APIGatewayProxyEventV2 {
  return {
    routeKey: route,
    requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) },
    pathParameters: patternId === undefined ? undefined : { patternId },
    body,
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}
export const claimsOf = (username: string, groups: string[]) => ({ sub: `sub-${username}`, username, groups: JSON.stringify(groups) });

export const lockBusy = () =>
  new TransactionCanceledException({
    message: 'Transaction cancelled [ConditionalCheckFailed, None]',
    $metadata: {},
    CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }],
  });
