import { error, noContent, ok, parseJsonBody } from '../../../src/lib/http';

describe('ok', () => {
  it('returns the status, a JSON content type and the serialised body', () => {
    expect(ok(201, { a: 1 })).toEqual({
      statusCode: 201,
      headers: { 'content-type': 'application/json' },
      body: '{"a":1}',
    });
  });
});

describe('noContent', () => {
  it('returns 204 without a body', () => {
    expect(noContent()).toEqual({ statusCode: 204 });
  });
});

describe('error', () => {
  it('returns the { error, message } body shape', () => {
    const response = error(409, 'user_exists', 'User already exists');
    expect(response.statusCode).toBe(409);
    expect(response.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(response.body as string)).toEqual({ error: 'user_exists', message: 'User already exists' });
  });
});

describe('parseJsonBody', () => {
  it('parses a JSON body', () => {
    expect(parseJsonBody({ body: '{"username":"bob"}', isBase64Encoded: false })).toEqual({
      ok: true,
      value: { username: 'bob' },
    });
  });

  it('decodes a base64-encoded body first', () => {
    const body = Buffer.from('{"username":"bob"}').toString('base64');
    expect(parseJsonBody({ body, isBase64Encoded: true })).toEqual({ ok: true, value: { username: 'bob' } });
  });

  it.each([
    ['invalid JSON', '{"username":'],
    ['an empty body', ''],
    ['a missing body', undefined],
  ])('returns 400 for %s', (_case, body) => {
    const result = parseJsonBody({ body, isBase64Encoded: false });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.statusCode).toBe(400);
    expect(JSON.parse(result.response.body as string)).toEqual({
      error: 'invalid_json',
      message: 'Request body must be a JSON document',
    });
  });
});
