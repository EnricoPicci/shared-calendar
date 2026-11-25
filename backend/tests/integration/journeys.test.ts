import { api, createSecondAdmin, factsOf, removeUserIfPresent, scanMessages, setPasswordOf, signIn, withFacts } from './setup';

// The journeys of docs/ARCHITECTURE.md section 6, end to end through sam local, as numbered in the
// table of docs/IMPLEMENTATION_PLAN.md step 9 (journeys 1 to 12). They run in order and share
// tokens. carol is the throw-away user.
//
// Secrets: tokens and carol's password stay in variables. Assertions look at their presence
// and length only, so a failure message never prints one. POST /users answers no password: carol's
// is set by setPasswordOf right after her creation, as her first sign-in would
// (docs/EMAIL_PLAN.md finding F1).

const ADMIN_PASSWORD = 'Admin-Local-Pass-1!';
const ALICE_PASSWORD = 'Alice-Local-Pass-1!';

let adminToken: string;
let aliceToken: string;
let carolPassword: string;
let carolMessageId: string;

// Message rows are kept forever (history), so look up the row a journey just wrote by its id;
// never count rows.
async function messageRow(messageId: string) {
  return (await scanMessages()).find((row) => row.messageId === messageId);
}

beforeAll(async () => {
  // A run that failed after carol was created (test 6) and before she was deleted (test 11) leaves
  // her behind; creating her again would then get 409.
  await removeUserIfPresent('carol');
});

it('1. alice and admin sign in without a challenge', async () => {
  aliceToken = await signIn('alice', ALICE_PASSWORD);
  adminToken = await signIn('admin', ADMIN_PASSWORD);
  expect(aliceToken.length).toBeGreaterThan(100);
  expect(adminToken.length).toBeGreaterThan(100);
});

it('2. /hello without a token is 401, with a garbage token 403 (API Gateway answers)', async () => {
  const missing = await api('POST', '/hello');
  expect(missing.status).toBe(401);
  expect(missing.body).toEqual({ message: expect.any(String) });

  const garbage = await api('POST', '/hello', 'garbage');
  expect(garbage.status).toBe(403);
  expect(garbage.body).toEqual({ message: expect.any(String) });
});

it('3. /hello as alice stores a user message', async () => {
  const res = await api('POST', '/hello', aliceToken);
  expect(res.status).toBe(201);
  expect(res.body).toEqual({
    messageId: expect.any(String),
    role: 'user',
    message: 'Hello World, I am alice',
    createdAt: expect.any(String),
  });
  expect(await messageRow(res.body?.messageId as string)).toEqual({
    ...res.body,
    userId: expect.any(String),
    userName: 'alice',
  });
});

it('4. /hello as admin stores an Administrator message', async () => {
  const res = await api('POST', '/hello', adminToken);
  expect(res.status).toBe(201);
  expect(res.body).toEqual({
    messageId: expect.any(String),
    role: 'admin',
    message: 'Hello World, the Administrator is speaking',
    createdAt: expect.any(String),
  });
  expect(await messageRow(res.body?.messageId as string)).toEqual({
    ...res.body,
    userId: expect.any(String),
    userName: 'admin',
  });
});

it('5. POST /users as alice is 403', async () => {
  const res = await api('POST', '/users', aliceToken, withFacts('carol'));
  expect(res.status).toBe(403);
  expect(res.body).toMatchObject({ error: 'forbidden' });
});

it('6. POST /users as admin creates carol, invited and with no password in the answer; with her password set, she can sign in and say hello', async () => {
  const res = await api('POST', '/users', adminToken, withFacts('carol'));
  expect(res.status).toBe(201);
  expect(res.body).toEqual({ username: 'carol', status: 'invited' });
  carolPassword = await setPasswordOf('carol');

  const carolToken = await signIn('carol', carolPassword);
  expect(carolToken.length).toBeGreaterThan(100);

  const hello = await api('POST', '/hello', carolToken);
  expect(hello.status).toBe(201);
  expect(hello.body).toMatchObject({ role: 'user', message: 'Hello World, I am carol' });
  carolMessageId = hello.body?.messageId as string;
  expect(await messageRow(carolMessageId)).toMatchObject({ userName: 'carol', role: 'user' });
});

it('7. POST /users again with carol is 409', async () => {
  const res = await api('POST', '/users', adminToken, withFacts('carol'));
  expect(res.status).toBe(409);
  expect(res.body).toMatchObject({ error: 'user_exists' });
});

it('8. POST /users with an invalid username is 400 naming the field', async () => {
  const res = await api('POST', '/users', adminToken, withFacts('Bad Name'));
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'invalid_request', message: 'Invalid input: username' });
});

it('8b. DELETE /users/Bob (invalid path) is 400 naming the field', async () => {
  const res = await api('DELETE', '/users/Bob', adminToken);
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'invalid_request', message: 'Invalid input: username' });
});

it('9. DELETE /users/carol as alice is 403', async () => {
  const res = await api('DELETE', '/users/carol', aliceToken);
  expect(res.status).toBe(403);
  expect(res.body).toMatchObject({ error: 'forbidden' });
});

it('10. DELETE /users/admin as admin is 403 cannot_delete_admin', async () => {
  const res = await api('DELETE', '/users/admin', adminToken);
  expect(res.status).toBe(403);
  expect(res.body).toMatchObject({ error: 'cannot_delete_admin' });
});

it('11. DELETE /users/carol as admin is 204; carol cannot sign in; her message stays', async () => {
  const res = await api('DELETE', '/users/carol', adminToken);
  expect(res.status).toBe(204);
  expect(res.body).toBeUndefined();

  // Not expect(...).rejects: if sign-in wrongly succeeded, the failure would print the token.
  const outcome = await signIn('carol', carolPassword).then(
    () => 'signed in',
    (err: unknown) => String((err as { name?: unknown }).name),
  );
  expect(outcome).toMatch(/^(NotAuthorizedException|UserNotFoundException)$/);

  expect(await messageRow(carolMessageId)).toMatchObject({ userName: 'carol', message: 'Hello World, I am carol' });
});

it('12. DELETE /users/carol again is 404', async () => {
  const res = await api('DELETE', '/users/carol', adminToken);
  expect(res.status).toBe(404);
  expect(res.body).toMatchObject({ error: 'user_not_found' });
});

// The four facts of a person (docs/EMAIL_ARCHITECTURE.md section 4): POST /users with the facts,
// GET /users, GET /me for both roles, PUT /users/{username}. It plays a throw-away User,
// `profile-user`, and a second administrator, `profile-admin`, made straight in cognito-local
// since the API can never create one; both are removed before and after. The Administrator's own
// facts are saved once with the values the seed gives them (scripts/local-seed.sh), so the stack is
// left as it was found.
//
// Explained in simple words in docs/journeys/backend/profiles.md.
describe('profiles', () => {
  const USER = 'profile-user';
  const OTHER_ADMIN = 'profile-admin';
  const OTHER_ADMIN_PASSWORD = 'Profile-Admin-Pass-1!';
  const ADMIN_FACTS = { givenName: 'Ada', familyName: 'Lovelace', email: 'admin@example.com', address: 'Via dei Calcoli 1\n00100 Roma' };
  const CHANGED = { givenName: 'Changed', familyName: 'Person', email: 'changed@example.com', address: 'Corso Nuovo 9\n10100 Torino' };
  let userToken: string;

  const removeBoth = async () => {
    await removeUserIfPresent(USER);
    await removeUserIfPresent(OTHER_ADMIN);
  };
  beforeAll(removeBoth);
  afterAll(removeBoth);

  it('POST /users with the four facts creates the User; the answer is the username and the state invited only', async () => {
    const res = await api('POST', '/users', adminToken, { ...withFacts(USER), givenName: ' Throw ', email: 'Profile-User@Example.com' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ username: USER, status: 'invited' });
    userToken = await signIn(USER, await setPasswordOf(USER));
  });

  it('POST /users without the facts, or with an e-mail that is not one, is 400 naming the fields', async () => {
    const bare = await api('POST', '/users', adminToken, { username: 'profile-bare' });
    expect(bare.status).toBe(400);
    expect(bare.body).toEqual({ error: 'invalid_request', message: 'Invalid input: givenName, familyName, email, address' });
    const wrong = await api('POST', '/users', adminToken, { ...withFacts('profile-bare'), email: 'not-an-address' });
    expect(wrong.body).toEqual({ error: 'invalid_request', message: 'Invalid input: email' });
  });

  it('GET /users lists the User with the four facts as stored (trimmed, the e-mail lower-cased) and the state active', async () => {
    const res = await api('GET', '/users', adminToken);
    expect(res.status).toBe(200);
    const listed = (res.body?.users as Record<string, unknown>[]).find((user) => user.username === USER);
    expect(listed).toEqual({ username: USER, createdAt: expect.any(String), status: 'active', ...factsOf(USER), email: 'profile-user@example.com' });
  });

  it('GET /me: the User reads their own facts; the Administrator reads theirs, those of the seed', async () => {
    const asUser = await api('GET', '/me', userToken);
    expect(asUser.status).toBe(200);
    expect(asUser.body).toEqual({ username: USER, role: 'user', ...factsOf(USER), email: 'profile-user@example.com' });
    const asAdmin = await api('GET', '/me', adminToken);
    expect(asAdmin.body).toEqual({ username: 'admin', role: 'admin', ...ADMIN_FACTS });
  });

  it('PUT /users/profile-user as the Administrator replaces the four facts; the answer and the User\'s GET /me say the new ones', async () => {
    const res = await api('PUT', `/users/${USER}`, adminToken, CHANGED);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: USER, createdAt: expect.any(String), status: 'active', ...CHANGED });
    expect((await api('GET', '/me', userToken)).body).toEqual({ username: USER, role: 'user', ...CHANGED });
  });

  it('PUT /users/admin as the Administrator saves their own facts', async () => {
    const res = await api('PUT', '/users/admin', adminToken, ADMIN_FACTS);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: 'admin', ...ADMIN_FACTS });
  });

  it('PUT on a user that does not exist is 404 user_not_found; a body with a field too many is 400', async () => {
    const missing = await api('PUT', '/users/profile-nobody', adminToken, CHANGED);
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ error: 'user_not_found' });
    const extra = await api('PUT', `/users/${USER}`, adminToken, { ...CHANGED, username: 'other' });
    expect(extra.status).toBe(400);
    expect(extra.body).toEqual({ error: 'invalid_request', message: 'Invalid input: username' });
  });

  it('PUT on another administrator is 403 cannot_edit_admin; that administrator\'s GET /me says no fact is held yet', async () => {
    await createSecondAdmin(OTHER_ADMIN, OTHER_ADMIN_PASSWORD);
    const res = await api('PUT', `/users/${OTHER_ADMIN}`, adminToken, CHANGED);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'cannot_edit_admin', message: "Another administrator's details cannot be changed" });
    const otherToken = await signIn(OTHER_ADMIN, OTHER_ADMIN_PASSWORD);
    expect((await api('GET', '/me', otherToken)).body).toEqual({ username: OTHER_ADMIN, role: 'admin', givenName: null, familyName: null, email: null, address: null });
  });

  it('PUT as a User, even on their own account, is 403 forbidden, and nothing changes', async () => {
    for (const target of [USER, 'alice']) {
      const res = await api('PUT', `/users/${target}`, userToken, ADMIN_FACTS);
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: 'forbidden' });
    }
    expect((await api('PUT', '/users/alice', aliceToken, ADMIN_FACTS)).status).toBe(403);
    expect((await api('GET', '/me', userToken)).body).toMatchObject(CHANGED);
  });
});
