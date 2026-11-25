import { kindFor, MailerEvent } from '../../../src/lib/mailerEvent';

// The mailer's event (docs/EMAIL_ARCHITECTURE.md section 6.1).
const MINE = { kind: 'mine', sub: 'sub-alice', username: 'alice', role: 'user', from: '2026-12-01', to: '2026-12-07', requestId: 'req-1' };
const issues = (value: unknown) => {
  const parsed = MailerEvent.safeParse(value);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.'));
};

describe('MailerEvent', () => {
  it('accepts a User asking for their own and the Administrator for the calendar', () => {
    expect(issues(MINE)).toEqual([]);
    expect(issues({ ...MINE, kind: 'calendar', role: 'admin', username: 'admin' })).toEqual([]);
  });

  it('refuses a kind that does not follow the role', () => {
    expect(issues({ ...MINE, kind: 'calendar' })).toEqual(['kind']);
    expect(issues({ ...MINE, role: 'admin' })).toEqual(['kind']);
  });

  it('refuses a range the route would refuse: reversed, longer than 366 days, not dates', () => {
    expect(issues({ ...MINE, from: '2026-12-08' })).toEqual(['to']);
    expect(issues({ ...MINE, to: '2027-12-02' })).toEqual(['to']);
    expect(issues({ ...MINE, to: '2027-12-01' })).toEqual([]);
    expect(issues({ ...MINE, from: 'today' })).toEqual(['to']);
  });

  it('refuses an address, or any field it does not know, and a missing request id', () => {
    expect(issues({ ...MINE, email: 'someone@example.com' })).toEqual(['']);
    const withoutId: Partial<typeof MINE> = { ...MINE };
    delete withoutId.requestId;
    expect(issues(withoutId)).toEqual(['requestId']);
    expect(issues({ ...MINE, username: 'Not A Username' })).toEqual(['username']);
  });
});

describe('kindFor', () => {
  it('gives the Administrator the calendar and a User their own', () => {
    expect(kindFor('admin')).toBe('calendar');
    expect(kindFor('user')).toBe('mine');
  });
});
