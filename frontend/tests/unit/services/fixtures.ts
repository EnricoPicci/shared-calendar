import type { Session } from '../../../src/services/login.types';

// Shared by the unit tests (not a test file: the unit project selects *.test.ts only).

function b64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// An unsigned JWT with the given claims: the services decode, never verify (section 4.5).
export function jwt(claims: Record<string, unknown>): string {
  return `${b64url('{"alg":"RS256"}')}.${b64url(JSON.stringify(claims))}.signature`;
}

export function json(status: number, body: unknown, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });
}

// A Cognito 200 with the given tokens (section 4.1).
export function cognitoTokens(result: Record<string, unknown>): Response {
  return json(200, { AuthenticationResult: { ExpiresIn: 900, TokenType: 'Bearer', ...result }, ChallengeParameters: {} }, 'application/x-amz-json-1.1');
}

export function cognitoError(type: string, message: string): Response {
  return json(400, { __type: type, message }, 'application/x-amz-json-1.1');
}

// A session expiring `minutes` from the (possibly fake) clock.
export function session(over: Partial<Session> = {}, minutes = 15): Session {
  return {
    username: 'alice',
    role: 'user',
    accessToken: 'access-token-alice',
    idToken: 'id-token-alice',
    refreshToken: 'refresh-token-alice',
    expiresAt: new Date(Date.now() + minutes * 60_000),
    ...over,
  };
}

// The fetch stub's call `i`: URL and init.
export function call(fetchMock: ReturnType<typeof vi.fn>, i = 0): [string, RequestInit] {
  return fetchMock.mock.calls[i] as [string, RequestInit];
}
