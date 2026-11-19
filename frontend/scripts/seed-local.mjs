// npm run seed:local -w frontend: gives the LOCAL calendar a week to look at, through the local
// API (cognito-local on 9229, the API on 3000: npm run local:up -w backend, then
// npm run local:api -w backend).
//
// As the seeded Administrator: two availability types, "Studio" and "Piscina", and a few weekly
// patterns of each, valid for 60 days from today, so that the dates the front end's integration
// journeys use (from today + 330 days) stay free. Then, as the seeded User alice: a few
// appointments on free slots of the week of today and of the next one, some with a note. alice
// books for herself, so the server offers and accepts only what the current settings allow; no
// setting is changed.
//
// It only adds, and it does nothing at all when the type "Studio" exists already. It refuses any
// address that is not on this machine. It prints what it created, never a token or a password.
// Appointments cannot be deleted through the API: after the back end's calendar journeys have
// emptied the table, run it again.
//
// The date arithmetic is shared/src/calendar/time.ts itself (Node runs it, stripping its
// types), so "today" and the weeks are those of the calendar's time zone, not the machine's.
import { readFile } from 'node:fs/promises';
import { addDays, localDateOf, localTimeOf, weekdayOf } from '../../shared/src/calendar/time.ts';

const API = process.env.SEED_API_URL ?? 'http://127.0.0.1:3000';
const COGNITO = process.env.SEED_COGNITO_URL ?? 'http://localhost:9229/';

function stop(message) {
  console.error(`seed: ${message}`);
  process.exit(1);
}

for (const address of [API, COGNITO]) {
  let host;
  try {
    host = new URL(address).hostname;
  } catch {
    stop(`"${address}" is not an address.`);
  }
  if (host !== 'localhost' && host !== '127.0.0.1') stop(`refused: ${address} is not on this machine. The seed is for the local stack only.`);
}

// The app client and the two users that backend/scripts/local-seed.sh creates in cognito-local.
// Their passwords are the local stack's fixed ones, written in that script and in CLAUDE.md.
let clientId;
try {
  const env = JSON.parse(await readFile(new URL('../../backend/env.local.json', import.meta.url), 'utf8'));
  clientId = env.AuthorizerFunction.CLIENT_ID;
} catch {
  stop('cannot read the client id from backend/env.local.json. Start the local stack first: npm run local:up -w backend');
}
const PASSWORDS = { admin: 'Admin-Local-Pass-1!', alice: 'Alice-Local-Pass-1!' };

// Signs in and returns the function that calls the API as that user. The token stays inside it.
async function signIn(username) {
  let answer;
  try {
    answer = await fetch(COGNITO, {
      method: 'POST',
      headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
      body: JSON.stringify({ AuthFlow: 'USER_PASSWORD_AUTH', ClientId: clientId, AuthParameters: { USERNAME: username, PASSWORD: PASSWORDS[username] } }),
    });
  } catch {
    throw new Error(`cognito-local is not reachable at ${COGNITO} (npm run local:up -w backend)`);
  }
  const token = (await answer.json().catch(() => ({}))).AuthenticationResult?.AccessToken;
  if (!token) throw new Error(`${username} could not sign in (HTTP ${answer.status}); npm run local:up -w backend restores the local passwords`);

  // One API call: the parsed answer, or an error with the status and the API's error code.
  return async function call(method, path, body) {
    let response;
    try {
      response = await fetch(API + path, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error(`the local API is not reachable at ${API} (npm run local:api -w backend)`);
    }
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${json.error ?? ''} ${json.message ?? ''}`.trim());
    return json;
  };
}

try {
  const admin = await signIn('admin');

  const { types } = await admin('GET', '/calendar/types');
  if (types.some((type) => type.name === 'Studio')) {
    console.log('The type "Studio" exists already: nothing to do.');
    process.exit(0);
  }

  // "Today" in the calendar's own time zone, which the settings name.
  const { timeZone } = await admin('GET', '/calendar/settings');
  const today = localDateOf(new Date().toISOString(), timeZone);
  const validFrom = today;
  const validUntil = addDays(today, 60);

  const studio = await admin('POST', '/calendar/types', { name: 'Studio' });
  const piscina = await admin('POST', '/calendar/types', { name: 'Piscina' });
  console.log('Created the types "Studio" and "Piscina".');

  // Studio: Monday to Friday mornings. Piscina: Tuesday and Thursday afternoons, Saturday morning.
  const patterns = [
    ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '13:00', typeId: studio.typeId })),
    ...[2, 4].map((weekday) => ({ weekday, start: '15:00', end: '18:00', typeId: piscina.typeId })),
    { weekday: 6, start: '10:00', end: '12:00', typeId: piscina.typeId },
  ];
  for (const pattern of patterns) await admin('POST', '/calendar/patterns', { ...pattern, validFrom, validUntil });
  console.log(`Created ${patterns.length} weekly patterns, valid ${validFrom} to ${validUntil} (${timeZone}).`);

  // The appointments: alice's own view of the two weeks holds the slots she may book.
  const monday = addDays(today, 1 - weekdayOf(today));
  // Which slots to take: [week, the n-th day of that week that has a free slot, the n-th slot of
  // that day, the note]. A week with fewer days or a day with fewer slots gives fewer appointments.
  const WANTED = [
    [0, 0, 0, 'First lesson'],
    [0, 1, 1, null],
    [1, 0, 2, 'Bring the forms'],
    [1, 2, 0, null],
    [1, 3, 1, 'Second lesson'],
  ];
  let booked = 0;
  try {
    const alice = await signIn('alice');
    const calendar = await alice('GET', `/calendar?from=${monday}&to=${addDays(monday, 13)}`);
    const names = new Map([
      [studio.typeId, 'Studio'],
      [piscina.typeId, 'Piscina'],
    ]);
    for (const [week, day, nth, note] of WANTED) {
      const days = calendar.days.slice(week * 7, week * 7 + 7).filter((candidate) => candidate.slots.length > 0);
      const slot = days[day]?.slots[nth];
      if (!slot) continue;
      try {
        await alice('POST', '/calendar/appointments', { start: slot.start, ...(note ? { note } : {}) });
        booked++;
        console.log(`Booked for alice: ${localDateOf(slot.start, timeZone)} ${localTimeOf(slot.start, timeZone)}, ${names.get(slot.typeId)}${note ? `, note "${note}"` : ''}.`);
      } catch (error) {
        console.log(`Not booked (${localDateOf(slot.start, timeZone)} ${localTimeOf(slot.start, timeZone)}): ${error.message}`);
      }
    }
  } catch (error) {
    console.log(`No appointment could be booked for alice: ${error.message}`);
  }
  if (booked === 0) console.log('No appointment was booked: the current settings leave alice no free slot in these two weeks, or she could not book. The types and the patterns are there.');
  else console.log(`Booked ${booked} appointment${booked === 1 ? '' : 's'} for alice in the weeks of ${monday} and ${addDays(monday, 7)}.`);
} catch (error) {
  stop(error.message);
}
