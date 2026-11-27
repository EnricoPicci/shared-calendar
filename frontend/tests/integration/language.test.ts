import { decodeClaims } from '../../src/services/jwt';
import { LanguageService } from '../../src/services/language.service';
import type { LanguageReadResult, LanguageWriteResult } from '../../src/services/language.types';
import { SessionStore } from '../../src/services/session.store';
import { UsersService } from '../../src/services/users.service';
import { API, cognito, current, newUser, outcome, setPermanentPassword, signedIn, signIn } from './local';

// The language of a person (docs/MULTILANGUAGE_PLAN.md finding F11): LanguageService against the
// back end's local stack, straight at the Cognito emulator with the person's own access token, as
// the page does it at sign-in and in "My details". Runs only with RUN_INTEGRATION=1.
//
// It plays a throw-away User of its own, `fe-language`, created through UsersService as the
// Administrator and removed before and after, so that a run that failed half-way is repeated
// without a step by hand. `alice` is only read, to show that the throw-away's writes stay in its
// own account; `admin` creates and removes the account and calls the two routes that must refuse
// a language.
//
// The emulator accepts any word as `locale`, as Cognito does, and ignores the app client's list of
// writable attributes (docs/MULTILANGUAGE_PLAN.md finding F8): that only `locale` can be written
// is for the cloud.
//
// Secrets: the passwords and the tokens stay in variables and in the stores; no assertion prints one.

const THROWAWAY = 'fe-language';

let admin: SessionStore;
let user: SessionStore;
const stores: SessionStore[] = [];

async function removeThrowaway(): Promise<void> {
  const users = new UsersService(API, admin);
  const result = await outcome(users.deleteUserResult$, () => users.deleteUser(THROWAWAY));
  if (result.status === 'failure' && result.reason !== 'user_not_found') throw new Error(`could not remove ${THROWAWAY}: ${result.reason}`);
}

function read(store: SessionStore): Promise<LanguageReadResult> {
  const service = new LanguageService(cognito(), store);
  return outcome(service.readResult$, () => service.read());
}

function write(store: SessionStore, language: 'en' | 'it'): Promise<LanguageWriteResult> {
  const service = new LanguageService(cognito(), store);
  return outcome(service.writeResult$, () => service.write(language));
}

// A request to the API as the Administrator, with a body the page's services would refuse to send.
async function asAdmin(method: 'POST' | 'PUT', path: string, body: unknown): Promise<{ status: number; error: unknown }> {
  const session = await current(admin);
  const response = await fetch(`${API.apiUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${session!.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, error: ((await response.json()) as { error?: unknown }).error };
}

// Explained in simple words in docs/journeys/frontend/language.md.
describe('the language of a person', () => {
  beforeAll(async () => {
    admin = await signedIn('admin');
    stores.push(admin);
    await removeThrowaway();
    const users = new UsersService(API, admin);
    const created = await outcome(users.createUserResult$, () => users.createUser(newUser(THROWAWAY)));
    if (created.status !== 'success') throw new Error(`could not create ${THROWAWAY}: ${JSON.stringify(created)}`);
    const signed = await signIn(THROWAWAY, await setPermanentPassword(THROWAWAY));
    if (signed.result.status !== 'success') throw new Error(`${THROWAWAY} could not sign in`);
    user = signed.store;
    stores.push(user);
  });

  afterAll(async () => {
    await removeThrowaway();
    for (const store of stores) store.clear(); // stops the expiry timers
  });

  it('1. a new account holds no language', async () => {
    expect(await read(user)).toEqual({ status: 'success', language: null });
  });

  it('2. the person writes Italian with their own token, and reads it back', async () => {
    expect(await write(user, 'it')).toEqual({ status: 'success', language: 'it' });
    expect(await read(user)).toEqual({ status: 'success', language: 'it' });
  });

  it('3. a change to English replaces it', async () => {
    expect(await write(user, 'en')).toEqual({ status: 'success', language: 'en' });
    expect(await read(user)).toEqual({ status: 'success', language: 'en' });
  });

  it('4. the writes stay in the person\'s own account: alice\'s language is as it was', async () => {
    const alice = await signedIn('alice');
    stores.push(alice);
    const before = await read(alice);
    await write(user, 'it');
    expect(before.status).toBe('success');
    expect(await read(alice)).toEqual(before);
  });

  it('5. a word that is no language of the calendar, written by hand at Cognito, reads as none', async () => {
    const session = await current(user);
    const response = await fetch(cognito().cognitoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.UpdateUserAttributes' },
      body: JSON.stringify({ AccessToken: session!.accessToken, UserAttributes: [{ Name: 'locale', Value: 'fr' }] }),
    });
    expect(response.status).toBe(200);
    expect(await read(user)).toEqual({ status: 'success', language: null });
  });

  it('6. the id token of a new sign-in does not carry the language: it is read with GetUser', async () => {
    await write(user, 'it');
    const again = await signIn(THROWAWAY, await setPermanentPassword(THROWAWAY));
    stores.push(again.store);
    const session = await current(again.store);
    expect(decodeClaims(session!.idToken)).not.toHaveProperty('locale');
    expect(await read(again.store)).toEqual({ status: 'success', language: 'it' });
  });

  it('7. the Administrator\'s routes refuse a language: it is the person\'s own to choose', async () => {
    const { givenName, familyName, email, address } = newUser(THROWAWAY);
    expect(await asAdmin('PUT', `/users/${THROWAWAY}`, { givenName, familyName, email, address, language: 'it' })).toEqual({ status: 400, error: 'invalid_request' });
    expect(await asAdmin('POST', '/users', { ...newUser('fe-language-new'), language: 'it' })).toEqual({ status: 400, error: 'invalid_request' });
  });

  it('8. nobody signed in: nothing is sent', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      expect(await read(new SessionStore())).toMatchObject({ status: 'failure', reason: 'not_signed_in' });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
