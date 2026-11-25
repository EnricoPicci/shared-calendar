import { ChangePasswordService } from '../../src/services/change-password.service';
import type { ChangePasswordResult } from '../../src/services/change-password.types';
import { SessionStore } from '../../src/services/session.store';
import { UsersService } from '../../src/services/users.service';
import { API, changePasswordConfig, current, newUser, outcome, PASSWORDS, setPermanentPassword, signedIn, signIn } from './local';

// The change of one's own password of docs/FRONTEND_SERVICES.md section 14.9: ChangePasswordService
// against the back end's local stack, straight at the Cognito emulator, as the page will do it
// (docs/ARCHITECTURE.md section 6.9). Runs only with RUN_INTEGRATION=1.
//
// It plays a throw-away User of its own, `fe-password`, created through UsersService as the
// Administrator and removed before and after, so that a run that failed half-way, leaving the
// account with another password, is repeated without a step by hand. The local accounts `admin`
// and `alice` never change their password here: `admin` only creates and removes the account.
//
// The emulator differs from Cognito in two ways that bear on this file (docs/ARCHITECTURE.md
// section 8): it answers a wrong current password with InvalidPasswordException, and it cannot
// sign out everywhere, which the local configuration skips.
//
// Secrets: the passwords stay in variables and in the stores; no assertion prints one.

const THROWAWAY = 'fe-password';
// A new password the pool's rule accepts.
const NEW_PASSWORD = 'Fe-Password-New-2?';

let admin: SessionStore;
let firstPassword = ''; // the password the API generated for the account
let user: SessionStore; // the account's session, which the change ends
const stores: SessionStore[] = [];

async function removeThrowaway(): Promise<void> {
  const users = new UsersService(API, admin);
  const result = await outcome(users.deleteUserResult$, () => users.deleteUser(THROWAWAY));
  if (result.status === 'failure' && result.reason !== 'user_not_found') throw new Error(`could not remove ${THROWAWAY}: ${result.reason}`);
}

function change(store: SessionStore, currentPassword: string, newPassword: string): Promise<ChangePasswordResult> {
  const service = new ChangePasswordService(changePasswordConfig(), store);
  return outcome(service.changePasswordResult$, () => service.changePassword(currentPassword, newPassword));
}

// A sign-in into a store of its own, kept for the clean-up.
async function signInAs(password: string) {
  const signed = await signIn(THROWAWAY, password);
  stores.push(signed.store);
  return signed;
}

// Explained in simple words in docs/journeys/frontend/change-password.md.
describe('change password', () => {
  beforeAll(async () => {
    admin = await signedIn('admin');
    stores.push(admin);
    await removeThrowaway();
    const users = new UsersService(API, admin);
    const created = await outcome(users.createUserResult$, () => users.createUser(newUser(THROWAWAY)));
    if (created.status !== 'success') throw new Error(`could not create ${THROWAWAY}: ${JSON.stringify(created)}`);
    firstPassword = await setPermanentPassword(THROWAWAY);
    const signed = await signInAs(firstPassword);
    if (signed.result.status !== 'success') throw new Error(`${THROWAWAY} could not sign in`);
    user = signed.store;
  });

  afterAll(async () => {
    await removeThrowaway();
    for (const store of stores) store.clear(); // stops the expiry timers
  });

  it('1. a wrong current password is refused: nothing changes, the old password still signs in', async () => {
    const result = await change(user, `${firstPassword}x`, NEW_PASSWORD);
    expect(result).toMatchObject({ status: 'failure', reason: 'wrong_current_password' });
    expect(await current(user)).toMatchObject({ username: THROWAWAY });
    expect((await signInAs(firstPassword)).result).toMatchObject({ status: 'success', username: THROWAWAY });
  });

  it('2. a new password the rule refuses, or the current one again, sends nothing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      expect(await change(user, firstPassword, 'short')).toMatchObject({
        status: 'failure',
        reason: 'new_password_refused',
        problems: ['too_short', 'no_uppercase', 'no_digit', 'no_symbol'],
      });
      expect(await change(user, firstPassword, firstPassword)).toMatchObject({ reason: 'new_password_refused', problems: ['same_as_current'] });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
    expect(await current(user)).toMatchObject({ username: THROWAWAY });
  });

  it('3. the change succeeds, with the sign-out skipped as locally configured, and the store is empty', async () => {
    expect(await change(user, firstPassword, NEW_PASSWORD)).toEqual({ status: 'success' });
    expect(await current(user)).toBeNull();
  });

  it('4. the old password no longer signs in', async () => {
    expect((await signInAs(firstPassword)).result).toMatchObject({ status: 'failure', reason: 'invalid_credentials' });
  });

  it('5. the new password signs in, and the change is the account\'s own', async () => {
    const signed = await signInAs(NEW_PASSWORD);
    expect(signed.result).toMatchObject({ status: 'success', username: THROWAWAY, role: 'user' });
    expect(await current(signed.store)).toMatchObject({ username: THROWAWAY });
    // The Administrator's password did not change: admin signs in with the local one.
    const adminAgain = await signIn('admin', PASSWORDS.admin);
    stores.push(adminAgain.store);
    expect(adminAgain.result).toMatchObject({ status: 'success', role: 'admin' });
  });
});
