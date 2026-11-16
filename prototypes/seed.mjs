// Gives the LOCAL calendar something to show: two availability types and a few weekly patterns
// for the next 60 days, created through the local API as the seeded Administrator.
//
//   node prototypes/seed.mjs
//
// Local stack only (cognito-local on 9229, the API on 3000). Does nothing when the type "Studio"
// already exists. The patterns end after 60 days so that the dates the front end's integration
// journeys use, from today + 330 days, stay free. The data goes away with
// `npm run local:down -w backend` or with the back end's calendar journeys, which empty the table.

import { readFile } from 'node:fs/promises';

const API = 'http://127.0.0.1:3000';
const COGNITO = 'http://localhost:9229/';
const env = JSON.parse(await readFile(new URL('../backend/env.local.json', import.meta.url), 'utf8'));

// The seeded local Administrator of backend/scripts/local-seed.sh.
const signIn = await fetch(COGNITO, {
  method: 'POST',
  headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
  body: JSON.stringify({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: env.AuthorizerFunction.CLIENT_ID,
    AuthParameters: { USERNAME: 'admin', PASSWORD: 'Admin-Local-Pass-1!' },
  }),
});
const token = (await signIn.json()).AuthenticationResult?.AccessToken;
if (!token) throw new Error(`the local Administrator could not sign in (HTTP ${signIn.status})`);

async function call(method, path, body) {
  const answer = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await answer.json();
  if (!answer.ok) throw new Error(`${method} ${path}: HTTP ${answer.status} ${JSON.stringify(json)}`);
  return json;
}

const { types } = await call('GET', '/calendar/types');
if (types.some((type) => type.name === 'Studio')) {
  console.log('The type "Studio" exists already: nothing to do.');
  process.exit(0);
}

const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const validFrom = day(0);
const validUntil = day(60);

const studio = await call('POST', '/calendar/types', { name: 'Studio' });
const pool = await call('POST', '/calendar/types', { name: 'Swimming Pool' });

// Studio: Monday to Friday mornings. Swimming Pool: Tuesday and Thursday afternoons, Saturday morning.
const patterns = [
  ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '13:00', typeId: studio.typeId })),
  ...[2, 4].map((weekday) => ({ weekday, start: '15:00', end: '18:00', typeId: pool.typeId })),
  { weekday: 6, start: '10:00', end: '12:00', typeId: pool.typeId },
];
for (const pattern of patterns) await call('POST', '/calendar/patterns', { ...pattern, validFrom, validUntil });

console.log(`Created 2 types and ${patterns.length} weekly patterns, valid ${validFrom} to ${validUntil}.`);
