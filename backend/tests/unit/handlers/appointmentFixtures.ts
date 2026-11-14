import { GetCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { STUDIO, type harness } from './availabilityFixtures';

// Shared by the handlers of plan step 49 (listAppointments, updateAppointmentNote,
// cancelAppointment). The dates of spec 18.3: Europe/Rome (UTC+1 in November); alice holds
// 2026-11-16 09:00–10:00 local (08:00Z–09:00Z) at the Studio; AC-20's now is 2026-11-15T09:00 local,
// AC-21's 09:01.

export * from './availabilityFixtures';

export const APPT_ID = '01M70NR5E0Q7R2C9T5XH3KD8MV';
export const START = '2026-11-16T08:00:00.000Z';
export const END = '2026-11-16T09:00:00.000Z';
export const SK = `${START}#${APPT_ID}`;
export const AC20_NOW = '2026-11-15T08:00:00.000Z';
export const AC21_NOW = '2026-11-15T08:01:00.000Z';
export const BOOKED_AT = '2026-11-10T09:00:00.000Z';
export const NOTE = 'private note, never logged';

const ALICE_ACTOR = { username: 'alice', role: 'user' } as const;

/** Alice's appointment item with every attribute (architecture 5.3), as a booking writes it. */
export const storedItem = (more: Record<string, unknown> = {}) => ({
  PK: 'APPT',
  SK,
  userId: 'sub-alice',
  username: 'alice',
  start: START,
  end: END,
  date: '2026-11-16',
  typeId: STUDIO,
  typeNameAtBooking: 'Studio at booking',
  note: NOTE,
  status: 'booked',
  createdAt: BOOKED_AT,
  createdBy: ALICE_ACTOR,
  updatedAt: BOOKED_AT,
  updatedBy: ALICE_ACTOR,
  cancelledAt: null,
  cancelledBy: null,
  cancelReason: null,
  replaces: null,
  replacedBy: null,
  version: 1,
  ...more,
});

/** Makes the lookup by id find `item` (the pointer, then the APPT item) and the Studio type by key. */
export function storeAppointment(ddb: ReturnType<typeof harness>['ddb'], item: Record<string, unknown> = storedItem()) {
  ddb.on(GetCommand, { Key: { PK: `APPTID#${APPT_ID}`, SK: 'APPTID' } }).resolves({ Item: { PK: `APPTID#${APPT_ID}`, SK: 'APPTID', sk: item.SK } });
  ddb.on(GetCommand, { Key: { PK: 'APPT', SK: item.SK } }).resolves({ Item: item });
  ddb.on(GetCommand, { Key: { PK: 'TYPE', SK: STUDIO } }).resolves({ Item: { PK: 'TYPE', SK: STUDIO, name: 'Studio', nameKey: 'studio' } });
}

/** An event with a query string (route 16). `query` undefined: no query string at all. */
export function queryEvent(route: string, lambda: Record<string, string> | undefined, query?: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    routeKey: route,
    requestContext: { requestId: 'req-1', ...(lambda && { authorizer: { lambda } }) },
    queryStringParameters: query,
  } as unknown as APIGatewayProxyEventV2;
}
