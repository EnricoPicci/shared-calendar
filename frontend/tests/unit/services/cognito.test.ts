import { firstValueFrom } from 'rxjs';
import { describe as describeError, initiateAuth, toAuthOutcome, type CognitoConfig } from '../../../src/services/cognito';
import { call, cognitoError, cognitoTokens, jwt } from './fixtures';

// docs/FRONTEND_SERVICES.md section 10.4. Most of the mapping is exercised through
// login.service.test.ts; these tests cover what the refresh flow adds.

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
  });
});

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
