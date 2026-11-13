import { CalendarQuery } from '@shared-calendar/shared';
import { error, noContent, ok, parseJsonBody, parseQuery } from '../../../src/lib/http';
import { validate } from '../../../src/lib/validation';

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

  it('adds conflicts when given (availability_conflict), and only then', () => {
    const conflicts = [{ appointmentId: '01JC0000000000000000000001', username: 'alice', start: '2026-11-16T08:00:00.000Z', end: '2026-11-16T09:00:00.000Z' }];
    const response = error(409, 'availability_conflict', '1 appointment would fall outside the availability', conflicts);
    expect(JSON.parse(response.body as string)).toEqual({
      error: 'availability_conflict',
      message: '1 appointment would fall outside the availability',
      conflicts,
    });
    expect(JSON.parse(error(409, 'availability_overlap', 'x').body as string)).not.toHaveProperty('conflicts');
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

describe('parseQuery', () => {
  const view = (queryStringParameters?: Record<string, string | undefined>) => validate(CalendarQuery, parseQuery({ queryStringParameters }));
  const message = (outcome: ReturnType<typeof view>) => (outcome.ok ? null : JSON.parse(outcome.response.body as string));

  it('gives the parameters as one string each', () => {
    expect(parseQuery({ queryStringParameters: { from: '2026-11-16', to: '2026-11-22' } })).toEqual({ from: '2026-11-16', to: '2026-11-22' });
    expect(view({ from: '2026-11-16', to: '2026-11-22' })).toEqual({ ok: true, value: { from: '2026-11-16', to: '2026-11-22' } });
  });

  it('gives {} without a query string, so the schema answers 400 for the missing fields', () => {
    expect(parseQuery({})).toEqual({});
    expect(parseQuery({ queryStringParameters: undefined })).toEqual({});
    expect(message(view(undefined))).toEqual({ error: 'invalid_request', message: 'Invalid input: from, to' });
  });

  it('drops a parameter API Gateway gives as undefined', () => {
    expect(parseQuery({ queryStringParameters: { from: '2026-11-16', to: undefined } })).toEqual({ from: '2026-11-16' });
  });

  it('keeps an unknown parameter, which the strict schema refuses', () => {
    expect(message(view({ from: '2026-11-16', to: '2026-11-16', upcoming: 'true' }))).toEqual({
      error: 'invalid_request',
      message: 'Invalid input: upcoming',
    });
  });

  it('a repeated parameter (joined with a comma by API Gateway) fails the date format', () => {
    expect(message(view({ from: '2026-11-16,2026-11-17', to: '2026-11-17' }))).toEqual({
      error: 'invalid_request',
      message: 'Invalid input: from',
    });
  });
});
