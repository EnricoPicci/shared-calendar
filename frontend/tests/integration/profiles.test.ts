import { MeService } from '../../src/services/me.service';
import { SessionStore } from '../../src/services/session.store';
import { UsersService } from '../../src/services/users.service';
import { API, newUser, outcome, signedIn, signIn } from './local';

// The four facts of a person of docs/EMAIL_ARCHITECTURE.md section 4: UsersService and MeService
// against the back end's local stack (docs/FRONTEND_SERVICES.md section 23). Runs only with
// RUN_INTEGRATION=1.
//
// It plays a throw-away User of its own, `fe-profile`, created as the Administrator and removed
// before and after. The Administrator's own facts are saved once with the values the seed gives
// them (backend/scripts/local-seed.sh), so the local stack is left as it was found.
//
// Secrets: the generated password stays in a variable; no assertion prints it.

const THROWAWAY = 'fe-profile';
// The Administrator's facts as the seed sets them.
const ADMIN_FACTS = { givenName: 'Ada', familyName: 'Lovelace', email: 'admin@example.com', address: 'Via dei Calcoli 1\n00100 Roma' };
// The four facts newUser() gives the throw-away User.
const { givenName, familyName, email, address } = newUser(THROWAWAY);
const facts = { givenName, familyName, email, address };
const CHANGED = { givenName: 'Changed', familyName: 'Person', email: 'changed@example.com', address: 'Corso Nuovo 9\n10100 Torino' };

let admin: SessionStore;
let user: SessionStore;
const stores: SessionStore[] = [];

async function removeThrowaway(): Promise<void> {
  const users = new UsersService(API, admin);
  const result = await outcome(users.deleteUserResult$, () => users.deleteUser(THROWAWAY));
  if (result.status === 'failure' && result.reason !== 'user_not_found') throw new Error(`could not remove ${THROWAWAY}: ${result.reason}`);
}
function me(store: SessionStore) {
  const service = new MeService(API, store);
  return outcome(service.meResult$, () => service.getMe());
}
function update(store: SessionStore, username: string, profile: typeof CHANGED) {
  const service = new UsersService(API, store);
  return outcome(service.updateUserResult$, () => service.updateUser(username, profile));
}

// Explained in simple words in docs/journeys/frontend/profiles.md.
describe('profiles', () => {
  beforeAll(async () => {
    admin = await signedIn('admin');
    stores.push(admin);
    await removeThrowaway();
  });
  afterAll(async () => {
    await removeThrowaway();
    for (const store of stores) store.clear(); // stops the expiry timers
  });

  it(`the Administrator creates ${THROWAWAY} with four facts, and the list shows them, the account active`, async () => {
    const users = new UsersService(API, admin);
    const created = await outcome(users.createUserResult$, () => users.createUser(newUser(THROWAWAY)));
    if (created.status !== 'success') throw new Error(`could not create ${THROWAWAY}: ${JSON.stringify(created)}`);
    const signed = await signIn(THROWAWAY, created.user.password);
    stores.push(signed.store);
    user = signed.store;
    const listed = await outcome(users.listUsersResult$, () => users.listUsers());
    if (listed.status !== 'success') throw new Error(`could not list: ${listed.reason}`);
    expect(listed.users.find((one) => one.username === THROWAWAY)).toMatchObject({ ...facts, status: 'active' });
    // No administrator is in the list.
    expect(listed.users.map((one) => one.username)).not.toContain('admin');
  });

  it(`${THROWAWAY} reads their own facts, as a User`, async () => {
    expect(await me(user)).toEqual({ status: 'success', me: { username: THROWAWAY, role: 'user', ...facts } });
  });

  it('the Administrator reads their own facts, those of the seed', async () => {
    expect(await me(admin)).toEqual({ status: 'success', me: { username: 'admin', role: 'admin', ...ADMIN_FACTS } });
  });

  it(`the Administrator changes the four facts of ${THROWAWAY}; the answer and ${THROWAWAY}'s own read say the new ones`, async () => {
    const result = await update(admin, THROWAWAY, { ...CHANGED, email: 'Changed@Example.com' });
    expect(result).toMatchObject({ status: 'success', user: { username: THROWAWAY, ...CHANGED, status: 'active' } });
    expect(await me(user)).toMatchObject({ status: 'success', me: CHANGED });
  });

  it('the Administrator saves their own facts', async () => {
    expect(await update(admin, 'admin', ADMIN_FACTS)).toMatchObject({ status: 'success', user: { username: 'admin', ...ADMIN_FACTS } });
  });

  it('a user that does not exist: user_not_found', async () => {
    expect(await update(admin, 'fe-nobody-here', CHANGED)).toMatchObject({ status: 'failure', reason: 'user_not_found' });
  });

  it(`${THROWAWAY} cannot change facts, not even their own: forbidden, the session kept`, async () => {
    expect(await update(user, THROWAWAY, CHANGED)).toMatchObject({ status: 'failure', reason: 'forbidden' });
    expect(await me(user)).toMatchObject({ status: 'success' });
  });

  it('a fact that is not one is refused before any request', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    try {
      expect(await update(admin, THROWAWAY, { ...CHANGED, email: 'not-an-address' })).toMatchObject({ status: 'failure', reason: 'invalid_request' });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
