import { addDays, DEFAULT_TIME_ZONE, localDateOf, MAIL_LIMITS } from '@shared-calendar/shared';
import { MailService } from '../../src/services/mail.service';
import type { SendCalendarResult } from '../../src/services/mail.types';
import { SessionStore } from '../../src/services/session.store';
import { UsersService } from '../../src/services/users.service';
import { API, newUser, outcome, signedIn, signIn } from './local';

// The mail of a range of dates of docs/EMAIL_ARCHITECTURE.md section 6: MailService against the
// back end's local stack (docs/FRONTEND_SERVICES.md section 24). Runs only with RUN_INTEGRATION=1,
// and needs, besides the API, `npm run local:lambda -w backend`, which runs the mailer, and the
// fake mail of the Docker stack on port 8025, which keeps what the mailer sends.
//
// It plays a throw-away User of its own, `fe-mail`, created as the Administrator and removed
// before and after, so that each run starts with a new `sub`, and so with the five mails a day
// allows (docs/EMAIL_ARCHITECTURE.md section 6.5). The Administrator asks for no mail: its count
// of the day would outlive the run. The new account has no appointment, so its mail lists none,
// whatever the calendar holds. Only the mails sent to `fe-mail`'s address are read and forgotten.
//
// Secrets: the generated password stays in a variable; no assertion prints it.

const THROWAWAY = 'fe-mail';
const ADDRESS = newUser(THROWAWAY).email;
const FAKE_MAIL = 'http://127.0.0.1:8025';

type FakeMail = { to: string[]; subject: string; text: string; attachments: { fileName: string }[] };

let admin: SessionStore;
let user: SessionStore;
const stores: SessionStore[] = [];
// The week of today, as the week page proposes it.
const today = localDateOf(new Date().toISOString(), DEFAULT_TIME_ZONE);
const RANGE = { from: today, to: addDays(today, 6) };

async function removeThrowaway(): Promise<void> {
  const users = new UsersService(API, admin);
  const result = await outcome(users.deleteUserResult$, () => users.deleteUser(THROWAWAY));
  if (result.status === 'failure' && result.reason !== 'user_not_found') throw new Error(`could not remove ${THROWAWAY}: ${result.reason}`);
}
function send(range: { from: string; to: string }): Promise<SendCalendarResult> {
  const service = new MailService(API, user);
  return outcome(service.sendCalendarResult$, () => service.sendCalendar(range));
}
// The fake mail's mails to the throw-away address, oldest first; and the same once there are
// `count` of them, waited for: the mailer runs in the background, after the route's answer.
async function mails(): Promise<FakeMail[]> {
  const res = await fetch(`${FAKE_MAIL}/mails?to=${encodeURIComponent(ADDRESS)}`);
  if (!res.ok) throw new Error(`the fake mail answered ${res.status}`);
  return ((await res.json()) as { mails: FakeMail[] }).mails;
}
async function mailsOnceThere(count: number): Promise<FakeMail[]> {
  await vi.waitFor(async () => expect((await mails()).length).toBeGreaterThanOrEqual(count), { timeout: 45_000, interval: 500 });
  return mails();
}
async function forgetMails(): Promise<void> {
  const res = await fetch(`${FAKE_MAIL}/mails?to=${encodeURIComponent(ADDRESS)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`the fake mail answered ${res.status}`);
}

// Explained in simple words in docs/journeys/frontend/mail.md.
describe('the mail of the calendar', () => {
  beforeAll(async () => {
    admin = await signedIn('admin');
    stores.push(admin);
    await removeThrowaway();
    const users = new UsersService(API, admin);
    const created = await outcome(users.createUserResult$, () => users.createUser(newUser(THROWAWAY)));
    if (created.status !== 'success') throw new Error(`could not create ${THROWAWAY}: ${JSON.stringify(created)}`);
    const signed = await signIn(THROWAWAY, created.user.password);
    stores.push(signed.store);
    user = signed.store;
    await forgetMails();
  });
  afterAll(async () => {
    await removeThrowaway();
    await forgetMails();
    for (const store of stores) store.clear(); // stops the expiry timers
  });

  it(`${THROWAWAY} asks for the mail of the week: success, then one mail to their own address, their appointments, none`, async () => {
    expect(await send(RANGE)).toEqual({ status: 'success' });
    const [mail, ...more] = await mailsOnceThere(1);
    expect(more).toEqual([]);
    expect(mail!.to).toEqual([ADDRESS]);
    expect(mail!.subject).toMatch(/^Your appointments, /);
    expect(mail!.text).toContain('You have no appointments in this period.');
    expect(mail!.attachments.map((file) => file.fileName)).toEqual([`my-appointments-${RANGE.from}-to-${RANGE.to}.xlsx`]);
  });

  it('two dates the wrong way round, or more than 366 days, are refused before any request, and no mail comes', async () => {
    expect(await send({ from: RANGE.to, to: RANGE.from })).toEqual({ status: 'failure', reason: 'invalid_request', message: 'to: `from` must not be after `to`' });
    expect(await send({ from: RANGE.from, to: addDays(RANGE.from, MAIL_LIMITS.rangeDays) })).toEqual({ status: 'failure', reason: 'invalid_request', message: 'to: at most 366 days' });
    expect(await mails()).toHaveLength(1);
  });

  it(`the sixth request of the day is mail_limit_reached, and ${THROWAWAY} has five mails`, async () => {
    // One asked above; four more reach the five.
    for (let i = 2; i <= MAIL_LIMITS.mailsPerDay; i += 1) expect(await send(RANGE)).toEqual({ status: 'success' });
    expect(await send(RANGE)).toMatchObject({ status: 'failure', reason: 'mail_limit_reached' });
    await mailsOnceThere(MAIL_LIMITS.mailsPerDay);
    // A moment more, to see that no sixth mail comes.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect(await mails()).toHaveLength(MAIL_LIMITS.mailsPerDay);
  });
});
