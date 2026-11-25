import { CreateUserBody, UsernameParam } from '@shared-calendar/shared';
import { validate } from '../../../src/lib/validation';

// What the username rule and the four facts accept and reject is tested in shared/tests/user.test.ts;
// this file tests the API's answer: the value on success, a 400 that names the fields (never the
// values).
const FACTS = { givenName: 'Bob', familyName: 'Bianchi', email: 'bob@example.com', address: 'Via Po 2' };

describe('validate with CreateUserBody', () => {
  it('returns the parsed value', () => {
    expect(validate(CreateUserBody, { username: 'bob', ...FACTS })).toEqual({ ok: true, value: { username: 'bob', ...FACTS } });
  });

  it('answers 400 invalid_request naming the field', () => {
    const result = validate(CreateUserBody, { username: 'Bob', ...FACTS });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.statusCode).toBe(400);
    expect(JSON.parse(result.response.body as string)).toEqual({
      error: 'invalid_request',
      message: 'Invalid input: username',
    });
  });

  it('rejects unknown fields, naming each one but not its value', () => {
    const result = validate(CreateUserBody, { username: 'bob', ...FACTS, group: 'admin', role: 'admin' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.statusCode).toBe(400);
    expect(JSON.parse(result.response.body as string)).toEqual({
      error: 'invalid_request',
      message: 'Invalid input: group, role',
    });
  });

  it('names an unknown field together with an invalid one', () => {
    const result = validate(CreateUserBody, { username: 'Bob', ...FACTS, group: 'admin' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(JSON.parse(result.response.body as string).message).toBe('Invalid input: username, group');
  });

  it('rejects a body that is not an object, naming the root', () => {
    const result = validate(CreateUserBody, ['bob']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(JSON.parse(result.response.body as string).message).toBe('Invalid input: (root)');
  });

  it('never echoes the rejected value', () => {
    const result = validate(CreateUserBody, { username: 'SECRET<script>', ...FACTS, email: 'SECRET@' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.body).not.toContain('SECRET');
  });
});

describe('validate with UsernameParam', () => {
  it.each([['Carol'], ['ca'], [undefined]])('rejects %s and names the field', (value) => {
    const result = validate(UsernameParam, { username: value });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(JSON.parse(result.response.body ?? '')).toEqual({ error: 'invalid_request', message: 'Invalid input: username' });
  });
});
