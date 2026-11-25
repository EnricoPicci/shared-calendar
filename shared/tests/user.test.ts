import { CreateUserBody, EmailAddress, PersonName, PostalAddress, PROFILE_LIMITS, UpdateUserBody, USER_STATUSES, USERNAME_PATTERN, UserProfile, UsernameParam } from '../src/index';

const facts = { givenName: 'Anna', familyName: 'Rossi', email: 'anna.rossi@example.com', address: 'Via Roma 1\n00100 Roma' };

describe('CreateUserBody', () => {
  it.each(['bob', 'alice', 'a.b-c_d', '0abc', 'a'.repeat(32)])('accepts %s', (username) => {
    expect(CreateUserBody.safeParse({ username, ...facts })).toEqual({ success: true, data: { username, ...facts } });
  });

  it.each([
    ['uppercase', 'Bob'],
    ['too short', 'ab'],
    ['too long', 'a'.repeat(33)],
    ['a space', 'bad name'],
    ['a leading dot', '.bob'],
    ['a leading dash', '-bob'],
    ['a non-string', 42],
  ])('rejects a username with %s', (_case, username) => {
    expect(CreateUserBody.safeParse({ username, ...facts }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(CreateUserBody.safeParse({ username: 'bob', ...facts, group: 'admin' }).success).toBe(false);
  });

  it('rejects a missing username', () => {
    expect(CreateUserBody.safeParse(facts).success).toBe(false);
  });

  it.each(['givenName', 'familyName', 'email', 'address'])('rejects a body without %s', (field) => {
    const body: Record<string, string> = { username: 'bob', ...facts };
    delete body[field];
    expect(CreateUserBody.safeParse(body).success).toBe(false);
  });

  it('rejects a body that is not an object', () => {
    expect(CreateUserBody.safeParse(['bob']).success).toBe(false);
  });
});

describe('UserProfile and UpdateUserBody', () => {
  it('are one schema, the four facts', () => {
    expect(UpdateUserBody).toBe(UserProfile);
    expect(UserProfile.safeParse(facts)).toEqual({ success: true, data: facts });
  });

  it('trims the facts and lower-cases the e-mail', () => {
    const parsed = UserProfile.parse({ givenName: '  Anna ', familyName: ' Rossi\t', email: ' Anna.Rossi@Example.COM ', address: '\n Via Roma 1 \n' });
    expect(parsed).toEqual({ givenName: 'Anna', familyName: 'Rossi', email: 'anna.rossi@example.com', address: 'Via Roma 1' });
  });

  it('rejects an unknown field, such as a username', () => {
    expect(UserProfile.safeParse({ ...facts, username: 'bob' }).success).toBe(false);
  });
});

describe('PersonName', () => {
  it.each([['one character', 'A'], ['the longest', 'a'.repeat(PROFILE_LIMITS.nameLength)], ['accents and an apostrophe', "Niccolò D'Ambrosio"]])('accepts %s', (_case, name) => {
    expect(PersonName.safeParse(name).success).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['only blanks', '   '],
    ['one too long', 'a'.repeat(PROFILE_LIMITS.nameLength + 1)],
    ['a line break', 'Anna\nMaria'],
    ['a non-string', 7],
  ])('rejects %s', (_case, name) => {
    expect(PersonName.safeParse(name).success).toBe(false);
  });

  it('counts the length after trimming', () => {
    expect(PersonName.safeParse(` ${'a'.repeat(PROFILE_LIMITS.nameLength)} `).success).toBe(true);
  });
});

describe('EmailAddress', () => {
  it('accepts an address, lower-cased', () => {
    expect(EmailAddress.parse('A.Rossi+cal@Mail.Example.IT')).toBe('a.rossi+cal@mail.example.it');
  });

  it('accepts the longest address and refuses one more character', () => {
    const domain = '@example.com';
    const labels = (n: number) => Array.from({ length: Math.ceil(n / 60) }, (_, i) => 'a'.repeat(Math.min(60, n - i * 60))).join('.');
    const longest = labels(PROFILE_LIMITS.emailLength - domain.length - 4) + domain;
    expect(longest.length).toBeLessThanOrEqual(PROFILE_LIMITS.emailLength);
    expect(EmailAddress.safeParse('x'.repeat(PROFILE_LIMITS.emailLength - longest.length) + longest).success).toBe(true);
    expect(EmailAddress.safeParse('x'.repeat(PROFILE_LIMITS.emailLength - longest.length + 1) + longest).success).toBe(false);
  });

  it.each([['no domain', 'anna.rossi@'], ['a space', 'anna rossi@x.it'], ['no @', 'anna.example.com'], ['empty', ''], ['two @', 'a@b@example.com']])('rejects %s', (_case, email) => {
    expect(EmailAddress.safeParse(email).success).toBe(false);
  });
});

describe('PostalAddress', () => {
  it('accepts several lines, a carriage return dropped', () => {
    expect(PostalAddress.parse('Via Roma 1\r\n00100 Roma\rItalia')).toBe('Via Roma 1\n00100 Roma\nItalia');
  });

  it('accepts the longest and refuses one more character', () => {
    expect(PostalAddress.safeParse('a'.repeat(PROFILE_LIMITS.addressLength)).success).toBe(true);
    expect(PostalAddress.safeParse('a'.repeat(PROFILE_LIMITS.addressLength + 1)).success).toBe(false);
  });

  it.each([['empty', ''], ['only blank lines', '\n \n'], ['a tab', 'Via\tRoma'], ['a control character', 'Via Roma\u0007']])('rejects %s', (_case, address) => {
    expect(PostalAddress.safeParse(address).success).toBe(false);
  });
});

describe('USER_STATUSES', () => {
  it('is invited and active', () => {
    expect(USER_STATUSES).toEqual(['invited', 'active']);
  });
});

describe('UsernameParam', () => {
  it('accepts a valid name', () => {
    expect(UsernameParam.safeParse({ username: 'carol' })).toEqual({ success: true, data: { username: 'carol' } });
  });

  it.each([['Carol'], ['ca'], [undefined]])('rejects %s', (value) => {
    expect(UsernameParam.safeParse({ username: value }).success).toBe(false);
  });
});

// Test names: the architecture is docs/ARCHITECTURE.md, and its section 4 is the API contract.
describe('USERNAME_PATTERN', () => {
  it('is the pattern of architecture section 4', () => {
    expect(USERNAME_PATTERN.source).toBe('^[a-z0-9][a-z0-9._-]{2,31}$');
  });
});
