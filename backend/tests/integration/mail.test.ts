import { addDays, localDateOf, localTimeOf, MAIL_LIMITS } from '@shared-calendar/shared';
import readXlsxFile from 'read-excel-file/node';
import {
  api,
  createSecondAdmin,
  factsOf,
  forgetMailsTo,
  removeUserIfPresent,
  runMailer,
  setFactsOf,
  signIn,
  subOf,
  waitForMails,
  withFacts,
  type FakeMail,
} from './setup';

// The e-mail journeys (docs/EMAIL_ARCHITECTURE.md sections 6 and 9.1), end to end through sam
// local: the mailer started through `npm run local:lambda`, by hand or by POST /mail/calendar, and
// each mail read back from the fake mail of the Docker stack (docs/EMAIL_ARCHITECTURE.md section
// 14.2).
//
// The calendar table is never emptied here, and nothing another file left in it is relied on. The
// file opens, as the Administrator, one extra window of its own on a day of its own (45 days after
// today, inside the booking horizon, far from the 12 to 28 days of the assistant's journeys), late
// in the evening, under a type of its own, and books three appointments in it through the API; each
// carries a note with a mark of this run. A file's rows are compared with those three, found by the
// mark, never counted on the whole table: an earlier run of the same day left its own, cancelled.
// At the end the appointments still booked are cancelled and the window and the type deleted;
// before it starts, what an interrupted run left is removed the same way.
//
// The counts of the mails on demand outlive a run, five a day for each `sub`: the route's block
// asks with throw-away accounts only, removed before and after, so that a run repeated the same day
// still has its five. Only the mails of the addresses a block made are read and forgotten, never
// the others the fake holds.
//
// Secrets: tokens and passwords stay in variables; no assertion prints one.

const ADMIN_PASSWORD = 'Admin-Local-Pass-1!';
const ALICE_PASSWORD = 'Alice-Local-Pass-1!';
const BOSS_PASSWORD = 'Boss-Local-Pass-1!';
const TYPE = 'mail journey';
const DAYS_AHEAD = 45;
// The mark of this run in each appointment's note.
const MARK = `mail journey ${Date.now()}`;
// What env.local.json gives the mailer (scripts/local-seed.sh, scripts/local-api.sh): the sender at
// the template's default domain, and the Reply-To that is the local stack's AlertEmail.
const FROM = '"Shared calendar" <noreply@example.com>';
const REPLY_TO = ['local@example.invalid'];

type Booked = { appointmentId: string; start: string; end: string; username: string; status: string; note: string | null; typeName: string };

let adminToken: string;
let aliceToken: string;
let zone: string;
let day: string;
// The journey's type.
let typeId: string;
// The journey's three appointments: alice's booked one, the throw-away User's, alice's cancelled one.
let booked: Booked[];

// Removes what the journey made in the calendar, when it is there: the appointments of its type
// still booked are cancelled, then its extra windows and its type deleted. It looks from today to
// the end of the booking horizon, so that what a run interrupted on an earlier date left goes too.
async function removeFromCalendar(): Promise<void> {
  const from = localDateOf(new Date().toISOString(), zone);
  const to = addDays(from, 56);
  const list = await api('GET', `/calendar/appointments?from=${from}&to=${to}`, adminToken);
  expect(list.status).toBe(200);
  for (const a of (list.body?.appointments as Booked[]).filter((a) => a.typeName === TYPE)) {
    expect((await api('POST', `/calendar/appointments/${a.appointmentId}/cancel`, adminToken, {})).status).toBe(200);
  }
  // The view gives at most 31 days at a time: the horizon is read in two parts.
  const windows: { typeName: string; source?: string; sourceId?: string }[] = [];
  for (const [start, end] of [[from, addDays(from, 28)], [addDays(from, 29), to]] as const) {
    const view = await api('GET', `/calendar?from=${start}&to=${end}`, adminToken);
    expect(view.status).toBe(200);
    windows.push(...(view.body?.days as { windows: typeof windows }[]).flatMap((d) => d.windows));
  }
  for (const w of windows.filter((w) => w.typeName === TYPE && w.source === 'one_off')) {
    expect((await api('DELETE', `/calendar/windows/${w.sourceId}`, adminToken)).status).toBe(204);
  }
  const types = (await api('GET', '/calendar/types', adminToken)).body?.types as { typeId: string; name: string }[];
  for (const t of types.filter((t) => t.name === TYPE)) {
    expect((await api('DELETE', `/calendar/types/${t.typeId}`, adminToken)).status).toBe(204);
  }
}

// Creates a throw-away User again (an earlier, interrupted run may have left it) and signs in.
async function newUser(username: string): Promise<string> {
  await removeUserIfPresent(username);
  const created = await api('POST', '/users', adminToken, withFacts(username));
  expect(created.status).toBe(201);
  return signIn(username, created.body?.password as string);
}

// Books, as the person, the free slot of the journey's type at a place of the day (0 is the first).
async function bookSlot(token: string, place: number): Promise<Booked> {
  const days = (await api('GET', `/calendar?from=${day}&to=${day}`, token)).body?.days as { slots: { start: string; typeId: string }[] }[];
  const slot = days[0]!.slots.filter((s) => s.typeId === typeId)[place]!;
  const res = await api('POST', '/calendar/appointments', token, { start: slot.start, note: MARK });
  expect(res.status).toBe(201);
  return res.body as unknown as Booked;
}

// A mail's one file, read back as rows of text: the headings first.
async function rowsOf(mail: FakeMail): Promise<(string | null)[][]> {
  expect(mail.attachments).toHaveLength(1);
  const sheets = await readXlsxFile(Buffer.from(mail.attachments[0]!.content, 'base64'));
  return sheets[0]!.data as (string | null)[][];
}

// The rows of a file that are this run's appointments, as objects by heading.
function journeyRows(rows: (string | null)[][]): Record<string, string | null>[] {
  const [headings, ...rest] = rows;
  return rest.map((row) => Object.fromEntries(headings!.map((h, i) => [h as string, row[i] ?? null]))).filter((r) => r.Note === MARK);
}

// One appointment as a row of the file expects it.
function rowOf(a: Booked, more: Record<string, string | null> = {}): Record<string, string | null> {
  return {
    Date: day,
    Start: localTimeOf(a.start, zone),
    End: localTimeOf(a.end, zone),
    Type: TYPE,
    Username: a.username,
    Status: a.status,
    'Cancelled because': a.status === 'cancelled' ? 'cancelled' : null,
    Note: MARK,
    'Booked at': expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/) as unknown as string,
    ...more,
  };
}

beforeAll(async () => {
  adminToken = await signIn('admin', ADMIN_PASSWORD);
  aliceToken = await signIn('alice', ALICE_PASSWORD);
  zone = (await api('GET', '/calendar/settings', adminToken)).body?.timeZone as string;
  day = addDays(localDateOf(new Date().toISOString(), zone), DAYS_AHEAD);
  await removeFromCalendar();

  const type = await api('POST', '/calendar/types', adminToken, { name: TYPE });
  expect(type.status).toBe(201);
  typeId = type.body?.typeId as string;
  const window = await api('POST', '/calendar/windows', adminToken, { date: day, start: '20:00', end: '23:00', typeId });
  expect(window.status).toBe(201);

  const bobToken = await newUser('mail-bob');
  const aliceBooked = await bookSlot(aliceToken, 0);
  const bobBooked = await bookSlot(bobToken, 0);
  const aliceCancelled = await bookSlot(aliceToken, 0);
  const cancel = await api('POST', `/calendar/appointments/${aliceCancelled.appointmentId}/cancel`, aliceToken, {});
  expect(cancel.status).toBe(200);
  booked = [aliceBooked, bobBooked, cancel.body as unknown as Booked];
});

afterAll(async () => {
  await removeFromCalendar();
  await removeUserIfPresent('mail-bob');
});

// Explained in simple words in docs/journeys/backend/mail-mailer.md.
// Test names: section numbers are those of docs/EMAIL_ARCHITECTURE.md.
describe('the mailer run by hand (6.1, 6.3)', () => {
  const event = (kind: 'calendar' | 'mine', token: string, username: string) => ({
    kind,
    sub: subOf(token),
    username,
    role: kind === 'calendar' ? 'admin' : 'user',
    from: day,
    to: day,
    requestId: `journey-${Date.now()}`,
  });

  beforeEach(async () => {
    await forgetMailsTo('admin@example.com');
    await forgetMailsTo('alice@example.com');
  });

  it("calendar: one mail to the Administrator's own address, From and Reply-To of the stack, the file with every appointment of the day and the names", async () => {
    const result = await runMailer(event('calendar', adminToken, 'admin'));
    expect(result).toMatchObject({ outcome: 'sent' });

    const mails = await waitForMails('admin@example.com', 1);
    expect(mails).toHaveLength(1);
    const mail = mails[0]!;
    expect(mail.to).toEqual(['admin@example.com']);
    expect(mail.from).toBe(FROM);
    expect(mail.replyTo).toEqual(REPLY_TO);
    expect(mail.subject).toMatch(/^Calendar, /);
    expect(mail.attachments[0]!.fileName).toBe(`calendar-${day}-to-${day}.xlsx`);

    const rows = await rowsOf(mail);
    expect(rows[0]).toEqual(['Date', 'Start', 'End', 'Type', 'Username', 'First name', 'Last name', 'Status', 'Cancelled because', 'Note', 'Booked at']);
    const bob = factsOf('mail-bob');
    expect(journeyRows(rows)).toEqual([
      rowOf(booked[0]!, { 'First name': 'Alice', 'Last name': 'Liddell' }),
      rowOf(booked[1]!, { 'First name': bob.givenName, 'Last name': bob.familyName }),
      rowOf(booked[2]!, { 'First name': 'Alice', 'Last name': 'Liddell' }),
    ].sort((a, b) => (a.Start! < b.Start! ? -1 : 1)));
    expect(await waitForMails('alice@example.com', 0)).toEqual([]);
  });

  it("mine: one mail to the User's own address, their appointments listed and in the file, nobody else's and no name", async () => {
    const result = await runMailer(event('mine', aliceToken, 'alice'));
    expect(result).toMatchObject({ outcome: 'sent' });

    const [mail, ...more] = await waitForMails('alice@example.com', 1);
    expect(more).toEqual([]);
    expect(mail!.to).toEqual(['alice@example.com']);
    expect(mail!.subject).toMatch(/^Your appointments, /);
    expect(mail!.attachments[0]!.fileName).toBe(`my-appointments-${day}-to-${day}.xlsx`);
    // The list names no person; that it holds nobody else's is seen in the file below.
    for (const a of [booked[0]!, booked[2]!]) {
      expect(mail!.text).toContain(`${localTimeOf(a.start, zone)}–${localTimeOf(a.end, zone)}, ${TYPE}, ${a.status}`);
    }

    const rows = await rowsOf(mail!);
    expect(rows[0]).toEqual(['Date', 'Start', 'End', 'Type', 'Username', 'Status', 'Cancelled because', 'Note', 'Booked at']);
    expect(rows.slice(1).every((row) => row[4] === 'alice')).toBe(true);
    expect(journeyRows(rows)).toEqual([rowOf(booked[0]!), rowOf(booked[2]!)].sort((a, b) => (a.Start! < b.Start! ? -1 : 1)));
    expect(await waitForMails('admin@example.com', 0)).toEqual([]);
  });

  it('an event carrying an address, or a kind not of the role, sends nothing', async () => {
    expect(await runMailer({ ...event('mine', aliceToken, 'alice'), email: 'admin@example.com' })).toEqual({ outcome: 'invalid_event' });
    expect(await runMailer({ ...event('mine', aliceToken, 'alice'), kind: 'calendar' })).toEqual({ outcome: 'invalid_event' });
    expect(await waitForMails('admin@example.com', 0)).toEqual([]);
    expect(await waitForMails('alice@example.com', 0)).toEqual([]);
  });
});

// Explained in simple words in docs/journeys/backend/mail-route.md.
// Test names: section numbers are those of docs/EMAIL_ARCHITECTURE.md.
describe('POST /mail/calendar (6.5, 9.1)', () => {
  const BOB = factsOf('mail-bob').email;
  const BOSS = factsOf('mail-boss').email;
  let bobToken: string;
  let bossToken: string;
  const ask = (token: string, body: unknown = { from: day, to: day }) => api('POST', '/mail/calendar', token, body);

  beforeAll(async () => {
    // A new mail-bob, so a new sub with all of today's five; the journey's appointment of the old
    // one stays in the calendar under the old sub, and is no longer his.
    bobToken = await newUser('mail-bob');
    // A second administrator with an address, made in cognito-local: the seeded one keeps its sub
    // from one run to the next, so its five of the day would run out.
    await removeUserIfPresent('mail-boss');
    await createSecondAdmin('mail-boss', BOSS_PASSWORD);
    await setFactsOf('mail-boss', factsOf('mail-boss'));
    bossToken = await signIn('mail-boss', BOSS_PASSWORD);
    await forgetMailsTo(BOB);
    await forgetMailsTo(BOSS);
  });

  afterAll(async () => {
    await removeUserIfPresent('mail-boss');
    await removeUserIfPresent('mail-nobody');
    await forgetMailsTo(BOB);
    await forgetMailsTo(BOSS);
  });

  it('the Administrator: 202 queued, then the whole calendar of the dates in a mail to their own address', async () => {
    const res = await ask(bossToken);
    expect(res).toEqual({ status: 202, body: { status: 'queued' } });

    const [mail, ...more] = await waitForMails(BOSS, 1);
    expect(more).toEqual([]);
    expect(mail!.to).toEqual([BOSS]);
    expect(mail!.subject).toMatch(/^Calendar, /);
    expect(journeyRows(await rowsOf(mail!))).toHaveLength(3);
  });

  it('a User: 202 queued, then their own appointments only, here none: the new account booked nothing', async () => {
    expect(await ask(bobToken)).toEqual({ status: 202, body: { status: 'queued' } });

    const [mail] = await waitForMails(BOB, 1);
    expect(mail!.to).toEqual([BOB]);
    expect(mail!.text).toContain('You have no appointments in this period.');
    expect(await rowsOf(mail!)).toHaveLength(1);
  });

  it('a range of 367 days is 400, and counts nothing', async () => {
    const res = await ask(bobToken, { from: day, to: addDays(day, MAIL_LIMITS.rangeDays) });
    expect(res).toEqual({ status: 400, body: { error: 'invalid_request', message: 'Invalid input: to' } });
    expect((await ask(bobToken, { from: day, to: day, recipient: BOSS })).status).toBe(400);
  });

  it('the sixth request of the day is 429 mail_limit_reached, and sends nothing', async () => {
    // One asked above; four more reach the five.
    for (let i = 2; i <= MAIL_LIMITS.mailsPerDay; i += 1) expect((await ask(bobToken)).status).toBe(202);
    const sixth = await ask(bobToken);
    expect(sixth).toEqual({ status: 429, body: { error: 'mail_limit_reached', message: 'No more e-mails can be asked for today' } });

    const mails = await waitForMails(BOB, MAIL_LIMITS.mailsPerDay);
    // A moment more, to see that no sixth mail comes.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect(await waitForMails(BOB, 0)).toHaveLength(MAIL_LIMITS.mailsPerDay);
    expect(mails.every((m) => m.to[0] === BOB)).toBe(true);
  });

  it('an account without an address is 409 no_email_address', async () => {
    await removeUserIfPresent('mail-nobody');
    await createSecondAdmin('mail-nobody', BOSS_PASSWORD);
    const token = await signIn('mail-nobody', BOSS_PASSWORD);
    expect(await ask(token)).toEqual({ status: 409, body: { error: 'no_email_address', message: 'This account has no e-mail address' } });
  });
});
