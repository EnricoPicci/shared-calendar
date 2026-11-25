import { DEFAULT_MAIL_SETTINGS, MAIL_LIMITS, MailCalendarBody, MailSettingsBody } from '../../src/index';

describe('MailSettingsBody', () => {
  it.each([0, 7, 23])('accepts the hour %i', (dailyHour) => {
    expect(MailSettingsBody.safeParse({ dailyEnabled: false, dailyHour }).success).toBe(true);
  });

  it.each([
    ['an hour below 0', { dailyEnabled: true, dailyHour: -1 }],
    ['an hour above 23', { dailyEnabled: true, dailyHour: 24 }],
    ['a half hour', { dailyEnabled: true, dailyHour: 7.5 }],
    ['a string for the switch', { dailyEnabled: 'yes', dailyHour: 7 }],
    ['a missing hour', { dailyEnabled: true }],
    ['an unknown field', { dailyEnabled: true, dailyHour: 7, to: 'x@example.com' }],
  ])('rejects %s', (_case, body) => {
    expect(MailSettingsBody.safeParse(body).success).toBe(false);
  });

  it('has defaults that it accepts: on, at 7', () => {
    expect(DEFAULT_MAIL_SETTINGS).toEqual({ dailyEnabled: true, dailyHour: 7 });
    expect(MailSettingsBody.safeParse(DEFAULT_MAIL_SETTINGS).success).toBe(true);
  });
});

describe('MailCalendarBody', () => {
  it('accepts one day', () => {
    expect(MailCalendarBody.safeParse({ from: '2026-12-01', to: '2026-12-01' }).success).toBe(true);
  });

  it('accepts 366 days and refuses 367', () => {
    expect(MAIL_LIMITS.rangeDays).toBe(366);
    expect(MailCalendarBody.safeParse({ from: '2026-01-01', to: '2027-01-01' }).success).toBe(true);
    const tooLong = MailCalendarBody.safeParse({ from: '2026-01-01', to: '2027-01-02' });
    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues).toEqual([expect.objectContaining({ path: ['to'], message: 'at most 366 days' })]);
  });

  it('refuses `from` after `to`, once, on `to`', () => {
    const result = MailCalendarBody.safeParse({ from: '2026-12-02', to: '2026-12-01' });
    expect(result.error?.issues).toEqual([expect.objectContaining({ path: ['to'], message: '`from` must not be after `to`' })]);
  });

  it.each([
    ['a date that does not exist', { from: '2027-02-29', to: '2027-03-01' }],
    ['a missing date', { from: '2026-12-01' }],
    ['an address', { from: '2026-12-01', to: '2026-12-02', email: 'x@example.com' }],
  ])('refuses %s', (_case, body) => {
    expect(MailCalendarBody.safeParse(body).success).toBe(false);
  });

  it('limits a User to five mails a day', () => {
    expect(MAIL_LIMITS.mailsPerDay).toBe(5);
  });
});
