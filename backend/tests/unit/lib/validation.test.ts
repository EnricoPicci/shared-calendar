import { CreateUserBody, UsernameParam, validate } from '../../../src/lib/validation';

describe('CreateUserBody', () => {
  it.each(['bob', 'alice', 'a.b-c_d', '0abc', 'a'.repeat(32)])('accepts %s', (username) => {
    expect(validate(CreateUserBody, { username })).toEqual({ ok: true, value: { username } });
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
    const result = validate(CreateUserBody, { username });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.statusCode).toBe(400);
    expect(JSON.parse(result.response.body as string)).toEqual({
      error: 'invalid_request',
      message: 'Invalid input: username',
    });
  });

  it('rejects unknown fields, naming each one but not its value', () => {
    const result = validate(CreateUserBody, { username: 'bob', group: 'admin', role: 'admin' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.statusCode).toBe(400);
    expect(JSON.parse(result.response.body as string)).toEqual({
      error: 'invalid_request',
      message: 'Invalid input: group, role',
    });
  });

  it('names an unknown field together with an invalid one', () => {
    const result = validate(CreateUserBody, { username: 'Bob', group: 'admin' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(JSON.parse(result.response.body as string).message).toBe('Invalid input: username, group');
  });

  it('rejects a missing username', () => {
    expect(validate(CreateUserBody, {}).ok).toBe(false);
  });

  it('rejects a body that is not an object, naming the root', () => {
    const result = validate(CreateUserBody, ['bob']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(JSON.parse(result.response.body as string).message).toBe('Invalid input: (root)');
  });

  it('never echoes the rejected value', () => {
    const result = validate(CreateUserBody, { username: 'SECRET<script>' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.body).not.toContain('SECRET');
  });
});

describe('UsernameParam', () => {
  it('accepts a valid name', () => {
    expect(validate(UsernameParam, { username: 'carol' })).toEqual({ ok: true, value: { username: 'carol' } });
  });

  it.each([['Carol'], ['ca'], [undefined]])('rejects %s and names the field', (value) => {
    const result = validate(UsernameParam, { username: value });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(JSON.parse(result.response.body ?? '')).toEqual({ error: 'invalid_request', message: 'Invalid input: username' });
  });
});
