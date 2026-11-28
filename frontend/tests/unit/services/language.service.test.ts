import { LanguageService } from '../../../src/services/language.service';
import type { LanguageReadResult, LanguageWriteResult, LanguageWriteState } from '../../../src/services/language.types';
import type { Session } from '../../../src/services/login.types';
import { SessionStore } from '../../../src/services/session.store';
import { call, cognitoError, json, session } from './fixtures';

// The unit tests of LanguageService (docs/MULTILANGUAGE_PLAN.md finding F11): fetch stubbed with
// real Response objects. Every test subscribes first, then calls.

const CONFIG = { cognitoUrl: 'http://cognito.test/' };
const ALICE = session();

// GetUser's answer: the account's attributes as names and values.
function user(attributes: Record<string, string>): Response {
  return json(200, { Username: 'alice', UserAttributes: Object.entries(attributes).map(([Name, Value]) => ({ Name, Value })) }, 'application/x-amz-json-1.1');
}

let fetchMock: ReturnType<typeof vi.fn>;
let emitted: unknown[];

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  emitted = [];
});
afterEach(() => {
  // No value holds a token of the session, nor any other fact of the account.
  const text = JSON.stringify(emitted);
  for (const secret of [ALICE.accessToken, ALICE.idToken, ALICE.refreshToken, 'alice@example.com']) expect(text).not.toContain(secret);
  vi.unstubAllGlobals();
});

function make(signedIn: Session | null = ALICE) {
  const store = new SessionStore();
  if (signedIn) store.set(signedIn);
  const service = new LanguageService(CONFIG, store);
  const reads: LanguageReadResult[] = [];
  const writes: LanguageWriteResult[] = [];
  const states: LanguageWriteState[] = [];
  const keep = <T>(list: T[]) => (value: T) => {
    list.push(value);
    emitted.push(value);
  };
  service.readResult$.subscribe(keep(reads));
  service.writeResult$.subscribe(keep(writes));
  service.writeState$.subscribe(keep(states));
  return { service, reads, writes, states };
}

const body = (i = 0) => JSON.parse(call(fetchMock, i)[1].body as string);
const target = (i = 0) => (call(fetchMock, i)[1].headers as Record<string, string>)['X-Amz-Target'];

describe('LanguageService', () => {
  describe('read', () => {
    it('GetUser with the access token, at Cognito; a language of the calendar is the answer', async () => {
      fetchMock.mockResolvedValueOnce(user({ email: 'alice@example.com', locale: 'it' }));
      const { service, reads } = make();
      service.read();
      await vi.waitFor(() => expect(reads).toHaveLength(1));
      expect(reads[0]).toEqual({ status: 'success', language: 'it' });
      expect([call(fetchMock)[0], target(), body()]).toEqual([CONFIG.cognitoUrl, 'AWSCognitoIdentityProviderService.GetUser', { AccessToken: ALICE.accessToken }]);
    });

    it.each([
      ['no language held', {}],
      ['a word that is no language of the calendar', { locale: 'fr' }],
      ['a language with a region', { locale: 'it-IT' }],
    ])('%s: none', async (_case, attributes) => {
      fetchMock.mockResolvedValueOnce(user(attributes));
      const { service, reads } = make();
      service.read();
      await vi.waitFor(() => expect(reads).toHaveLength(1));
      expect(reads[0]).toEqual({ status: 'success', language: null });
    });

    it('an answer without a list of attributes: none', async () => {
      fetchMock.mockResolvedValueOnce(json(200, {}, 'application/x-amz-json-1.1'));
      const { service, reads } = make();
      service.read();
      await vi.waitFor(() => expect(reads).toHaveLength(1));
      expect(reads[0]).toEqual({ status: 'success', language: null });
    });

    it.each([
      ['a token Cognito no longer takes', () => cognitoError('NotAuthorizedException', 'Access Token has been revoked'), 'session_rejected'],
      ['too many requests', () => cognitoError('TooManyRequestsException', 'Rate exceeded'), 'too_many_attempts'],
      ['a limit', () => cognitoError('LimitExceededException', 'Limit'), 'too_many_attempts'],
      ['a 5xx', () => json(500, { __type: 'InternalErrorException' }), 'server'],
      ['a 200 that is not JSON', () => new Response('<html>', { status: 200 }), 'server'],
      ['a refusal that is not JSON', () => new Response('<html>', { status: 502 }), 'server'],
      ['any other refusal', () => json(400, { __type: 'InvalidParameterException' }), 'unexpected'],
    ])('%s: a failure', async (_case, answer, reason) => {
      fetchMock.mockResolvedValueOnce(answer());
      const { service, reads } = make();
      service.read();
      await vi.waitFor(() => expect(reads).toHaveLength(1));
      expect(reads[0]).toMatchObject({ status: 'failure', reason });
    });

    it('a refusal without a message names the status', async () => {
      fetchMock.mockResolvedValueOnce(json(400, { __type: 'X' }));
      const { service, reads } = make();
      service.read();
      await vi.waitFor(() => expect(reads).toHaveLength(1));
      expect(reads[0]).toEqual({ status: 'failure', reason: 'unexpected', message: 'Cognito answered 400' });
    });

    it('the network fails: a failure', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const { service, reads } = make();
      service.read();
      await vi.waitFor(() => expect(reads).toHaveLength(1));
      expect(reads[0]).toEqual({ status: 'failure', reason: 'network', message: 'TypeError: Failed to fetch' });
    });

    it('nobody signed in: no request', async () => {
      const { service, reads } = make(null);
      service.read();
      await vi.waitFor(() => expect(reads).toHaveLength(1));
      expect(reads[0]).toMatchObject({ status: 'failure', reason: 'not_signed_in' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('a second read abandons the first, whose answer is not heard', async () => {
      let answerFirst!: (r: Response) => void;
      fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answerFirst = resolve))).mockResolvedValueOnce(user({ locale: 'en' }));
      const { service, reads } = make();
      service.read();
      service.read();
      await vi.waitFor(() => expect(reads).toHaveLength(1));
      answerFirst(user({ locale: 'it' }));
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(reads).toEqual([{ status: 'success', language: 'en' }]);
    });
  });

  describe('write', () => {
    it('UpdateUserAttributes with the access token and `locale` alone; pending, then the language stored', async () => {
      fetchMock.mockResolvedValueOnce(json(200, {}, 'application/x-amz-json-1.1'));
      const { service, writes, states } = make();
      service.write('it');
      await vi.waitFor(() => expect(writes).toHaveLength(1));
      expect(writes[0]).toEqual({ status: 'success', language: 'it' });
      expect(states).toEqual([{ status: 'idle' }, { status: 'pending', language: 'it' }, { status: 'success', language: 'it' }]);
      expect([target(), body()]).toEqual(['AWSCognitoIdentityProviderService.UpdateUserAttributes', { AccessToken: ALICE.accessToken, UserAttributes: [{ Name: 'locale', Value: 'it' }] }]);
    });

    it('a refusal: a failure, in the state too', async () => {
      fetchMock.mockResolvedValueOnce(cognitoError('NotAuthorizedException', 'A client attempted to write unauthorized attribute'));
      const { service, writes, states } = make();
      service.write('en');
      await vi.waitFor(() => expect(writes).toHaveLength(1));
      expect(writes[0]).toMatchObject({ status: 'failure', reason: 'session_rejected' });
      expect(states.at(-1)).toEqual(writes[0]);
    });

    it('the network fails, or nobody is signed in: a failure', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const first = make();
      first.service.write('it');
      await vi.waitFor(() => expect(first.writes).toHaveLength(1));
      expect(first.writes[0]).toMatchObject({ status: 'failure', reason: 'network' });
      const nobody = make(null);
      nobody.service.write('it');
      await vi.waitFor(() => expect(nobody.writes).toHaveLength(1));
      expect(nobody.writes[0]).toMatchObject({ status: 'failure', reason: 'not_signed_in' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('a second write abandons the first', async () => {
      fetchMock.mockReturnValueOnce(new Promise<Response>(() => {})).mockResolvedValueOnce(json(200, {}, 'application/x-amz-json-1.1'));
      const { service, writes } = make();
      service.write('it');
      service.write('en');
      await vi.waitFor(() => expect(writes).toHaveLength(1));
      expect(writes).toEqual([{ status: 'success', language: 'en' }]);
    });
  });
});
