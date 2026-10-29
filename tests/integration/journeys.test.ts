import { api, removeUserIfPresent, scanMessages, signIn } from './setup';

// The journeys of architecture section 6, end to end through sam local (plan step 9, table of
// journeys 1 to 12). They run in order and share tokens. carol is the throw-away user.
//
// Secrets: tokens and carol's password stay in variables. Assertions look at their presence
// and length only, so a failure message never prints one.

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
  // A run that failed between journeys 6 and 11 leaves carol behind; journey 6 would then get 409.
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
  const res = await api('POST', '/users', aliceToken, { username: 'carol' });
  expect(res.status).toBe(403);
  expect(res.body).toMatchObject({ error: 'forbidden' });
});

it('6. POST /users as admin creates carol, who can sign in and say hello', async () => {
  const res = await api('POST', '/users', adminToken, { username: 'carol' });
  expect(res.status).toBe(201);
  // Never compare the whole body: a failure would print the password.
  expect(Object.keys(res.body ?? {}).sort()).toEqual(['password', 'username']);
  expect(res.body?.username).toBe('carol');
  expect(typeof res.body?.password).toBe('string');
  carolPassword = res.body?.password as string;
  expect(carolPassword.length).toBe(16);

  const carolToken = await signIn('carol', carolPassword);
  expect(carolToken.length).toBeGreaterThan(100);

  const hello = await api('POST', '/hello', carolToken);
  expect(hello.status).toBe(201);
  expect(hello.body).toMatchObject({ role: 'user', message: 'Hello World, I am carol' });
  carolMessageId = hello.body?.messageId as string;
  expect(await messageRow(carolMessageId)).toMatchObject({ userName: 'carol', role: 'user' });
});

it('7. POST /users again with carol is 409', async () => {
  const res = await api('POST', '/users', adminToken, { username: 'carol' });
  expect(res.status).toBe(409);
  expect(res.body).toMatchObject({ error: 'user_exists' });
});

it('8. POST /users with an invalid username is 400 naming the field', async () => {
  const res = await api('POST', '/users', adminToken, { username: 'Bad Name' });
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
