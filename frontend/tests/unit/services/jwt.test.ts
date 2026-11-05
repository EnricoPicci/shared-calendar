import { decodeClaims } from '../../../src/services/jwt';

// base64url without padding, as in a real JWT.
function b64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('decodeClaims', () => {
  it('decodes the payload of a JWT', () => {
    const jwt = `h.${b64url(JSON.stringify({ username: 'alice', exp: 1 }))}.s`;
    expect(decodeClaims(jwt)).toEqual({ username: 'alice', exp: 1 });
  });

  it('handles the base64url characters - and _ and missing padding', () => {
    // '>>>' and '???' encode to '+' and '/' in base64, '-' and '_' in base64url.
    const payload = JSON.stringify({ a: '>>>', b: '???', c: 'éé' });
    const part = b64url(payload);
    expect(part).toMatch(/-/);
    expect(part).toMatch(/_/);
    expect(part.length % 4).not.toBe(0);
    expect(decodeClaims(`h.${part}.s`)).toEqual({ a: '>>>', b: '???', c: 'éé' });
  });

  it('throws on a string that is not a JWT', () => {
    expect(() => decodeClaims('not-a-jwt')).toThrow('not a JWT');
    expect(() => decodeClaims('a..c')).toThrow('not a JWT');
  });

  it('throws when the payload is not a JSON object', () => {
    expect(() => decodeClaims(`h.${b64url('[1]')}.s`)).toThrow('not an object');
    expect(() => decodeClaims(`h.${b64url('null')}.s`)).toThrow('not an object');
    expect(() => decodeClaims('h.!!!!.s')).toThrow();
  });
});
