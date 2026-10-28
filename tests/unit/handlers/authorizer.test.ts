import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import type { APIGatewayRequestAuthorizerEventV2 } from 'aws-lambda';
import { FetchError } from 'aws-jwt-verify/error';
import type { Jwks } from 'aws-jwt-verify/jwk';

// Real RS256 tokens signed with a key pair made here; the verifier gets the public key
// through cacheJwks(), so no network is involved (except in the explicit HTTP test).
const KID = 'test-key';
const CLIENT_ID = 'test-client';

function keyPair() {
  return generateKeyPairSync('rsa', { modulusLength: 2048 });
}
const { privateKey, publicKey } = keyPair();
const jwks: Jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kty: 'RSA', kid: KID, alg: 'RS256', use: 'sig' }] };

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

function sign(payload: object, key: KeyObject = privateKey): string {
  const unsigned = `${base64url({ alg: 'RS256', kid: KID, typ: 'JWT' })}.${base64url(payload)}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key).toString('base64url');
  return `${unsigned}.${signature}`;
}

const CLOUD = {
  mode: 'cloud',
  issuer: 'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_TestPool',
  env: { USER_POOL_ID: 'eu-west-1_TestPool', CLIENT_ID, JWKS_URI: '', COGNITO_ISSUER: '' },
};
const LOCAL = {
  mode: 'local',
  issuer: 'http://localhost:9229/local_pool',
  env: {
    USER_POOL_ID: 'local_pool',
    CLIENT_ID,
    JWKS_URI: 'http://cognito:9229/local_pool/.well-known/jwks.json',
    COGNITO_ISSUER: 'http://localhost:9229/local_pool',
  },
};

// The verifier is built at module load from the environment, so each test imports a fresh copy.
async function loadAuthorizer(env: Record<string, string>, { cacheKeys = true } = {}) {
  vi.resetModules();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const authorizer = await import('../../../src/handlers/authorizer');
  if (cacheKeys) authorizer.verifier.cacheJwks(jwks);
  return authorizer;
}

function eventWith(headers?: Record<string, string>): APIGatewayRequestAuthorizerEventV2 {
  return { headers, requestContext: { requestId: 'req-1' } } as unknown as APIGatewayRequestAuthorizerEventV2;
}

const now = () => Math.floor(Date.now() / 1000);

let output: string[];
beforeEach(() => {
  output = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe.each([CLOUD, LOCAL])('authorizer ($mode)', ({ issuer, env }) => {
  // A Cognito access token for alice, as both Cognito and cognito-local issue it.
  const accessClaims = (overrides: Record<string, unknown> = {}) => ({
    sub: 'sub-alice',
    username: 'alice',
    'cognito:groups': ['user'],
    iss: issuer,
    client_id: CLIENT_ID,
    token_use: 'access',
    scope: 'aws.cognito.signin.user.admin',
    iat: now(),
    exp: now() + 900,
    ...overrides,
  });
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  async function authorize(headers?: Record<string, string>) {
    const { handler } = await loadAuthorizer(env);
    return handler(eventWith(headers));
  }

  it('allows a valid access token and passes sub, username and groups to the handlers', async () => {
    const result = await authorize(bearer(sign(accessClaims())));
    expect(result).toEqual({
      isAuthorized: true,
      context: { sub: 'sub-alice', username: 'alice', groups: '["user"]' },
    });
  });

  it('passes every group, leaving the precedence rule to the handlers', async () => {
    const result = await authorize(bearer(sign(accessClaims({ 'cognito:groups': ['admin', 'user'] }))));
    expect(result).toMatchObject({ isAuthorized: true, context: { groups: '["admin","user"]' } });
  });

  it('allows a token without cognito:groups and passes an empty list', async () => {
    const result = await authorize(bearer(sign(accessClaims({ 'cognito:groups': undefined }))));
    expect(result).toMatchObject({ isAuthorized: true, context: { groups: '[]' } });
  });

  it('reads the header whatever its case', async () => {
    const result = await authorize({ Authorization: `Bearer ${sign(accessClaims())}` });
    expect(result.isAuthorized).toBe(true);
  });

  it.each([
    ['an expired token', () => sign(accessClaims({ iat: now() - 1000, exp: now() - 100 }))],
    ['a wrong issuer', () => sign(accessClaims({ iss: 'https://evil.example.com/pool' }))],
    ['a wrong client id', () => sign(accessClaims({ client_id: 'other-client' }))],
    [
      'an id token instead of an access token',
      () => sign(accessClaims({ token_use: 'id', aud: CLIENT_ID, client_id: undefined })),
    ],
    ['a signature from another key', () => sign(accessClaims(), keyPair().privateKey)],
    ['a garbage token', () => 'not-a-jwt'],
    ['a missing username claim', () => sign(accessClaims({ username: undefined }))],
    ['groups that are not a list of strings', () => sign(accessClaims({ 'cognito:groups': 'admin' }))],
  ])('denies %s and logs the reason without the token', async (_case, makeToken) => {
    const token = makeToken();
    const result = await authorize(bearer(token));
    expect(result).toEqual({ isAuthorized: false });
    expect(output).toHaveLength(1);
    expect(JSON.parse(output.join(''))).toMatchObject({ level: 'warn', requestId: 'req-1', msg: 'authorizer denied' });
    expect(output.join('')).not.toContain(token);
  });

  // An id token carries no client_id, so the log must name the real cause, not client_id.
  it('logs token use as the reason when an id token is sent', async () => {
    await authorize(bearer(sign(accessClaims({ token_use: 'id', aud: CLIENT_ID, client_id: undefined }))));
    const { reason } = JSON.parse(output.join(''));
    expect(reason.message).toMatch(/token.?use/i);
    expect(reason.message).not.toMatch(/client.?id/i);
  });

  it.each([
    ['no headers at all', undefined],
    ['no Authorization header', { 'content-type': 'application/json' }],
    ['a non-Bearer scheme', { authorization: 'Basic YWxpY2U6cGFzcw==' }],
    ['Bearer without a token', { authorization: 'Bearer ' }],
    ['a token without the Bearer prefix', { authorization: 'eyJ.eyJ.sig' }],
  ])('denies %s', async (_case, headers) => {
    expect(await authorize(headers)).toEqual({ isAuthorized: false });
    expect(JSON.parse(output.join(''))).toMatchObject({
      level: 'warn',
      reason: 'missing or malformed Authorization header',
    });
  });
});

describe('authorizer (local) key download', () => {
  const token = sign({
    sub: 'sub-alice',
    username: 'alice',
    iss: LOCAL.issuer,
    client_id: CLIENT_ID,
    token_use: 'access',
    exp: now() + 900,
  });

  // cognito-local serves its keys over plain HTTP, which the library's default fetcher refuses.
  it('fetches the JWKS over plain HTTP from JWKS_URI', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(jwks)));
    vi.stubGlobal('fetch', fetchMock);
    const { handler } = await loadAuthorizer(LOCAL.env, { cacheKeys: false });
    expect((await handler(eventWith({ authorization: `Bearer ${token}` }))).isAuthorized).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(LOCAL.env.JWKS_URI, { signal: expect.any(AbortSignal) });
  });

  // An unreachable key server is an outage, not a bad token: the authorizer crashes so the
  // client gets a 500 and the authorizer Errors alarm fires, instead of a silent 403.
  it.each([
    ['an error status', async () => new Response('down', { status: 503 }), 'status code 503'],
    [
      'a timeout',
      async () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
      'TimeoutError',
    ],
    ['a connection error', async () => Promise.reject(new TypeError('fetch failed')), 'fetch failed'],
  ])('crashes when the JWKS download fails with %s', async (_case, fetchImpl, detail) => {
    vi.stubGlobal('fetch', vi.fn(fetchImpl));
    const { handler } = await loadAuthorizer(LOCAL.env, { cacheKeys: false });
    await expect(handler(eventWith({ authorization: `Bearer ${token}` }))).rejects.toThrow(FetchError);
    const line = JSON.parse(output.join(''));
    expect(line).toMatchObject({ level: 'error', requestId: 'req-1' });
    expect(line.reason.message).toContain(detail);
    expect(output.join('')).not.toContain(token);
  });

  // An unknown key id makes the verifier download the keys again; if the server answers,
  // the token is simply bad, so this stays a 403 and must not crash.
  it('denies a token whose key id is not in the downloaded JWKS', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(jwks))));
    const { handler } = await loadAuthorizer(LOCAL.env, { cacheKeys: false });
    const [, payload, signature] = token.split('.');
    const otherKid = `${base64url({ alg: 'RS256', kid: 'unknown-key', typ: 'JWT' })}.${payload}.${signature}`;
    expect(await handler(eventWith({ authorization: `Bearer ${otherKid}` }))).toEqual({ isAuthorized: false });
  });
});

describe('authorizer (cloud) key download', () => {
  // The library's own HTTPS fetcher reports every failure as FetchError; simulate that
  // rather than calling the real Cognito endpoint.
  it('crashes when the signing keys cannot be downloaded', async () => {
    const { handler, verifier } = await loadAuthorizer(CLOUD.env, { cacheKeys: false });
    vi.spyOn(verifier, 'verify').mockRejectedValue(new FetchError('https://cognito-idp/jwks.json', 'timeout'));
    await expect(handler(eventWith({ authorization: 'Bearer a.b.c' }))).rejects.toThrow(FetchError);
    expect(JSON.parse(output.join(''))).toMatchObject({ level: 'error', requestId: 'req-1' });
  });
});
