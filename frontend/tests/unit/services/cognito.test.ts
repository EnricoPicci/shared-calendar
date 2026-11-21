import { firstValueFrom } from 'rxjs';
import { describe as describeError, initiateAuth, revokeToken, toAuthOutcome, toRevokeOutcome, type CognitoConfig } from '../../../src/services/cognito';
import { call, cognitoError, cognitoTokens, json, jwt } from './fixtures';

// docs/FRONTEND_SERVICES.md section 10.4. Most of the mapping is exercised through
// login.service.test.ts; these tests cover what the refresh flow adds, and the RevokeToken
// request with the reading of its answer.

const CONFIG: CognitoConfig = { cognitoUrl: 'http://cognito.test/', clientId: 'client-123' };
const EXP = Math.floor(Date.now() / 1000) + 900;
const ALICE = { username: 'alice', 'cognito:groups': ['user'], exp: EXP };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function outcomeOf(answer: Response, refreshToken?: string) {
  return toAuthOutcome(answer.status, await answer.text(), refreshToken);
}

describe('initiateAuth', () => {
  it.each([
    ['USER_PASSWORD_AUTH', { USERNAME: 'alice', PASSWORD: 'pw' }],
    ['REFRESH_TOKEN_AUTH', { REFRESH_TOKEN: 'refresh-token' }],
  ] as const)('request, %s: one POST with both headers, the flow, the client id and the parameters', async (flow, parameters) => {
    fetchMock.mockResolvedValueOnce(cognitoTokens({}));
    const answer = await firstValueFrom(initiateAuth(CONFIG, flow, parameters));
    expect(answer.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = call(fetchMock);
    expect(url).toBe('http://cognito.test/');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    });
    expect(JSON.parse(init.body as string)).toEqual({ AuthFlow: flow, ClientId: 'client-123', AuthParameters: parameters });
    // Only the revocation outlives the page.
    expect(init.keepalive).toBeUndefined();
  });
});

describe('revokeToken', () => {
  it('request: one POST with both headers, keepalive, and the client id and the token as the whole body', async () => {
    fetchMock.mockResolvedValueOnce(json(200, {}));
    const answer = await firstValueFrom(revokeToken(CONFIG, 'refresh-token'));
    expect(answer).toEqual({ status: 200, text: '{}' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = call(fetchMock);
    // The address is the configured one: the token is not in it.
    expect(url).toBe('http://cognito.test/');
    expect(init.method).toBe('POST');
    // No Authorization header: the operation takes no credentials.
    expect(init.headers).toEqual({
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.RevokeToken',
    });
    expect(init.keepalive).toBe(true);
    // Exactly these two: no ClientSecret, no RevokeAssociatedSessions.
    expect(JSON.parse(init.body as string)).toEqual({ ClientId: 'client-123', Token: 'refresh-token' });
  });
});

describe('toRevokeOutcome', () => {
  it.each(['{}', '', '<html>ok</html>'])('200 with the body %j: success', (text) => {
    expect(toRevokeOutcome(200, text)).toEqual({ status: 'success' });
  });

  it.each([
    ['UnauthorizedException', 400, 'token_rejected'],
    ['UnsupportedTokenTypeException', 400, 'token_rejected'],
    ['NotAuthorizedException', 400, 'token_rejected'],
    ['UnsupportedOperationException', 400, 'not_enabled'],
    ['OperationNotEnabledException', 400, 'not_enabled'],
    ['TooManyRequestsException', 400, 'too_many_attempts'],
    ['ThrottlingException', 400, 'too_many_attempts'],
    ['InternalErrorException', 500, 'server'],
    ['InvalidParameterException', 400, 'unexpected'],
    ['ForbiddenException', 400, 'unexpected'],
    ['ResourceNotFoundException', 400, 'unexpected'],
  ])('%s (%i): failure %s, and the message names the status and the type', (type, status, reason) => {
    const text = JSON.stringify({ __type: type, message: 'whatever Cognito says' });
    expect(toRevokeOutcome(status, text)).toEqual({ status: 'failure', reason, message: `Cognito answered ${status} ${type}` });
  });

  it('a namespaced type is read by its last part', () => {
    const text = JSON.stringify({ __type: 'com.amazonaws.cognito.identity.idp.model#UnauthorizedException' });
    expect(toRevokeOutcome(400, text)).toEqual({ status: 'failure', reason: 'token_rejected', message: 'Cognito answered 400 UnauthorizedException' });
  });

  it('a type outside the list: unexpected below 500, server from 500, and the message names the status only', () => {
    const text = JSON.stringify({ __type: 'SomethingElseException', message: 'no' });
    expect(toRevokeOutcome(400, text)).toEqual({ status: 'failure', reason: 'unexpected', message: 'Cognito answered 400' });
    expect(toRevokeOutcome(503, text)).toEqual({ status: 'failure', reason: 'server', message: 'Cognito answered 503' });
    // A name every object has is not a type of the list.
    expect(toRevokeOutcome(400, JSON.stringify({ __type: 'constructor' }))).toEqual({ status: 'failure', reason: 'unexpected', message: 'Cognito answered 400' });
  });

  it('a failure that is not JSON: server; JSON that is not an object: read as an empty body', () => {
    expect(toRevokeOutcome(502, '<html>Bad Gateway</html>')).toEqual({ status: 'failure', reason: 'server', message: 'Cognito answered 502 without JSON' });
    expect(toRevokeOutcome(400, 'null')).toEqual({ status: 'failure', reason: 'unexpected', message: 'Cognito answered 400' });
  });

  it('an answer that quotes the request: the outcome does not hold the token', () => {
    const token = 'refresh-token-alice';
    const quoted = JSON.stringify({ __type: 'InvalidParameterException', message: `Value '${token}' at 'token' failed to satisfy constraint` });
    expect(JSON.stringify(toRevokeOutcome(400, quoted))).not.toContain(token);
    const asType = JSON.stringify({ __type: token, message: token });
    expect(JSON.stringify(toRevokeOutcome(400, asType))).not.toContain(token);
  });
});

// Test names: decisions are those of docs/FRONTEND_SERVICES.md section 8.
describe('toAuthOutcome', () => {
  it('refresh answer without RefreshToken: the session keeps the refresh token passed in', async () => {
    const outcome = await outcomeOf(cognitoTokens({ AccessToken: jwt(ALICE), IdToken: 'id-2' }), 'kept');
    expect(outcome).toMatchObject({ status: 'success', session: { refreshToken: 'kept', idToken: 'id-2', username: 'alice' } });
  });

  it('refresh answer with a RefreshToken: the session has the new one (decision 21)', async () => {
    const outcome = await outcomeOf(cognitoTokens({ AccessToken: jwt(ALICE), IdToken: 'id-2', RefreshToken: 'rotated' }), 'kept');
    expect(outcome).toMatchObject({ status: 'success', session: { refreshToken: 'rotated' } });
  });

  it('no RefreshToken and none passed in (the login case): failure unexpected', async () => {
    const outcome = await outcomeOf(cognitoTokens({ AccessToken: jwt(ALICE), IdToken: 'id' }));
    expect(outcome).toMatchObject({ status: 'failure', reason: 'unexpected' });
  });

  it.each(['NotAuthorizedException', 'UserNotFoundException', 'InvalidPasswordException'])('%s: failure not_authorized', async (type) => {
    const outcome = await outcomeOf(cognitoError(type, 'User not authorized'));
    expect(outcome).toEqual({ status: 'failure', reason: 'not_authorized', message: 'User not authorized' });
  });
});

describe('describe', () => {
  it('an Error gives "Name: message"; anything else its string', () => {
    expect(describeError(new TypeError('fetch failed'))).toBe('TypeError: fetch failed');
    expect(describeError('down')).toBe('down');
  });
});
