import { ASSISTANT_TEXTS_EN, ASSISTANT_TEXTS_IT, MAIL_LIMITS, addDays, type MailSummary } from '@shared-calendar/shared';
import { CHANGE_HANDLERS } from '../../../../src/assistant/tools/changeHandlers';
import { sendCalendarMail, sendCalendarMailDefinition } from '../../../../src/assistant/tools/sendCalendarMail';
import { forClaude, isChange, type ChangeTool, type RouteAnswer, type ToolCall, type ToolContext } from '../../../../src/assistant/tools/tool';
import { handler as getMe } from '../../../../src/handlers/getMe';
import { handler as sendCalendarMailHandler } from '../../../../src/handlers/sendCalendarMail';

// The route the tool reads its facts through, GET /me, is replaced by `route`, the function a
// confirmation is given to call a route with: no handler runs and nothing is read. MAIL_STAGE is set
// by each test, as the template sets it for the two functions that make proposals.
const USER: ToolContext = { timeZone: 'Europe/Rome', role: 'user' };
const ADMIN: ToolContext = { timeZone: 'Europe/Rome', role: 'admin' };
const route = vi.fn<(handler: unknown, call: ToolCall) => Promise<RouteAnswer>>();
const mail = sendCalendarMail as ChangeTool<{ from: string; to: string }, MailSummary>;

const ME = { username: 'alice', role: 'user', givenName: 'Alice', familyName: 'Rossi', email: 'alice.rossi@example.com', address: 'Via Roma 1' };
const WEEK = { from: '2026-11-30', to: '2026-12-06' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('MAIL_STAGE', 'on');
  route.mockResolvedValue({ status: 200, body: ME });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('send_calendar_mail: what Claude is given (3, 8.2)', () => {
  it('is a change, offered to both roles, reads the person\'s details, and holds no handler of its route', () => {
    expect(sendCalendarMailDefinition).toMatchObject({ name: 'send_calendar_mail', kind: 'change', roles: ['admin', 'user'], reads: 'details' });
    expect(isChange(sendCalendarMail)).toBe(true);
    expect(sendCalendarMail).not.toHaveProperty('toHandler');
    expect(CHANGE_HANDLERS.send_calendar_mail).toBe(sendCalendarMailHandler);
  });

  it('its description says that calling it sends nothing by itself, to the own address only, what each role gets, and one mail over several periods', () => {
    const { description } = sendCalendarMailDefinition;
    expect(description).toContain('Calling this tool sends nothing by itself');
    expect(description).toContain('presses the confirm button');
    expect(description).toContain("the person's own account and to no other");
    expect(description).toContain('For a User the mail lists their own appointments');
    expect(description).toContain('for the Administrator it holds every appointment of the calendar');
    expect(description).toContain('call this tool once, from the first day of the earliest period to the last day of the latest');
    expect(description).toContain(`at most ${MAIL_LIMITS.rangeDays} days`);
    expect(description).toContain(`${MAIL_LIMITS.mailsPerDay} mails a day`);
  });

  it('takes two dates and nothing else, the same for both roles: no address', () => {
    const forUser = forClaude(sendCalendarMailDefinition, 'user');
    expect(forClaude(sendCalendarMailDefinition, 'admin')).toEqual(forUser);
    expect(forUser.input_schema).toMatchObject({ type: 'object', required: ['from', 'to'], additionalProperties: false });
    expect(Object.keys(forUser.input_schema.properties as object)).toEqual(['from', 'to']);
  });

  it('refuses a range the wrong way round, longer than the limit, a date that is not one, and an address', () => {
    const schema = sendCalendarMailDefinition.input('user');
    expect(schema.safeParse(WEEK).success).toBe(true);
    expect(schema.safeParse({ from: '2026-11-30', to: '2026-11-30' }).success).toBe(true);
    expect(schema.safeParse({ from: '2026-12-06', to: '2026-11-30' }).success).toBe(false);
    expect(schema.safeParse({ from: '2026-01-01', to: addDays('2026-01-01', MAIL_LIMITS.rangeDays - 1) }).success).toBe(true);
    expect(schema.safeParse({ from: '2026-01-01', to: addDays('2026-01-01', MAIL_LIMITS.rangeDays) }).success).toBe(false);
    expect(schema.safeParse({ from: 'next monday', to: '2026-12-06' }).success).toBe(false);
    expect(schema.safeParse({ ...WEEK, email: 'someone@example.com' }).success).toBe(false);
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('send_calendar_mail: the proposal (5.4, 5.5)', () => {
  it("a User: reads GET /me, proposes the route's request with the two dates, one mail per answer, and the address masked", async () => {
    const read = await mail.confirmation.read(WEEK, USER, route);
    expect(route).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledWith(getMe, { routeKey: 'GET /me', path: '/me' });
    expect(read).toEqual({
      ok: true,
      call: { routeKey: 'POST /mail/calendar', path: '/mail/calendar', body: WEEK },
      subjects: ['mail'],
      facts: { ...WEEK, kind: 'mine', address: 'a•••@example.com' },
    });
  });

  it('the Administrator: the same, and the mail holds the calendar', async () => {
    route.mockResolvedValue({ status: 200, body: { ...ME, username: 'admin', role: 'admin', email: 'boss@example.org' } });
    const read = await mail.confirmation.read(WEEK, ADMIN, route);
    expect(read).toMatchObject({ ok: true, facts: { ...WEEK, kind: 'calendar', address: 'b•••@example.org' } });
  });

  it('is worded by the fixed texts of the conversation\'s language, with the masked address and never the whole one', async () => {
    const read = await mail.confirmation.read(WEEK, USER, route);
    if (!read.ok) throw new Error('not proposed');
    expect(mail.confirmation.summary(ASSISTANT_TEXTS_EN, read.facts)).toBe('Send your appointments from Monday 30 November 2026 to Sunday 6 December 2026 to a•••@example.com.');
    expect(mail.confirmation.summary(ASSISTANT_TEXTS_IT, read.facts)).toBe("Inviare i suoi appuntamenti da lunedì 30 novembre 2026 a domenica 6 dicembre 2026 all'indirizzo a•••@example.com.");
    expect(JSON.stringify(read)).not.toContain('alice.rossi');
  });

  it.each([['off'], ['domain'], [undefined]])('a stage that is not on (%s): mail_unavailable, nothing read and nothing proposed', async (stage) => {
    if (stage === undefined) vi.stubEnv('MAIL_STAGE', undefined as unknown as string);
    else vi.stubEnv('MAIL_STAGE', stage);
    const read = await mail.confirmation.read(WEEK, USER, route);
    expect(read).toEqual({ ok: false, error: 'mail_unavailable', message: expect.stringContaining('not available yet') });
    expect(route).not.toHaveBeenCalled();
  });

  it('an account without an address: no_email_address, and nothing proposed', async () => {
    route.mockResolvedValue({ status: 200, body: { ...ME, email: null } });
    expect(await mail.confirmation.read(WEEK, USER, route)).toEqual({ ok: false, error: 'no_email_address', message: expect.stringContaining('no e-mail address') });
  });

  it("an account gone: the route's own user_not_found; a route that failed: internal_error", async () => {
    route.mockResolvedValue({ status: 404, body: { error: 'user_not_found', message: 'No user with this username' } });
    expect(await mail.confirmation.read(WEEK, USER, route)).toEqual({ ok: false, error: 'user_not_found', message: 'No user with this username' });
    route.mockResolvedValue({ status: 500, body: null });
    expect(await mail.confirmation.read(WEEK, USER, route)).toEqual({ ok: false, error: 'internal_error', message: "The person's details could not be read." });
  });
});

// Test names: section numbers are those of docs/CONVERSATIONAL_ARCHITECTURE.md.
describe('send_calendar_mail: what Claude is told after the confirmation (5.4, 8.3)', () => {
  it('that the mail is on its way, and nothing of the address', () => {
    const result = mail.toModel({ status: 'queued' }, USER);
    expect(result).toEqual({ fields: { message: expect.stringContaining('on its way') } });
    expect(JSON.stringify(result)).not.toMatch(/@|•/);
  });
});
