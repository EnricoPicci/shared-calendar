import { CreateUserBody, USERNAME_PATTERN, UsernameParam } from '../src/index';

describe('CreateUserBody', () => {
  it.each(['bob', 'alice', 'a.b-c_d', '0abc', 'a'.repeat(32)])('accepts %s', (username) => {
    expect(CreateUserBody.safeParse({ username })).toEqual({ success: true, data: { username } });
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
    expect(CreateUserBody.safeParse({ username }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(CreateUserBody.safeParse({ username: 'bob', group: 'admin' }).success).toBe(false);
  });

  it('rejects a missing username', () => {
    expect(CreateUserBody.safeParse({}).success).toBe(false);
  });

  it('rejects a body that is not an object', () => {
    expect(CreateUserBody.safeParse(['bob']).success).toBe(false);
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

describe('USERNAME_PATTERN', () => {
  it('is the pattern of architecture section 4', () => {
    expect(USERNAME_PATTERN.source).toBe('^[a-z0-9][a-z0-9._-]{2,31}$');
  });
});
