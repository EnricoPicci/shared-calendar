import type { Session } from '../../../src/services/login.types';
import { SessionStore } from '../../../src/services/session.store';
import { UsersService } from '../../../src/services/users.service';
import type { CreateUserResult, CreateUserState, DeleteUserResult, DeleteUserState } from '../../../src/services/users.types';
import { call, json, session } from './fixtures';
import { CONFIG, describeMethod, type MethodSpec } from './suite';

// docs/FRONTEND_SERVICES.md section 13.8. A real SessionStore; fetch stubbed with real Responses;
// every test subscribes first, then calls.

const GENERATED = 'Gen3rated-Pass-word!';
// A person's four facts, as the form holds them and as they are sent.
const FACTS = { givenName: 'Carol', familyName: 'Conti', email: 'carol@example.com', address: 'Via Roma 1\n00100 Roma' };
const newUser = (username: string) => ({ username, ...FACTS });

let fetchMock: ReturnType<typeof vi.fn>;
let store: SessionStore;
let service: UsersService;
let created: CreateUserResult[];
let createStates: CreateUserState[];
let deleted: DeleteUserResult[];
let deleteStates: DeleteUserState[];
let sessions: (Session | null)[];
let admin: Session;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  store = new SessionStore();
  service = new UsersService({ apiUrl: 'http://api.test' }, store);
  created = [];
  createStates = [];
  deleted = [];
  deleteStates = [];
  sessions = [];
  service.createUserResult$.subscribe((r) => created.push(r));
  service.createUserState$.subscribe((s) => createStates.push(s));
  service.deleteUserResult$.subscribe((r) => deleted.push(r));
  service.deleteUserState$.subscribe((s) => deleteStates.push(s));
  store.session$.subscribe((s) => sessions.push(s));
  admin = session({ username: 'admin', role: 'admin', accessToken: 'access-token-admin' });
  store.set(admin);
});
afterEach(() => {
  store.clear();
  vi.unstubAllGlobals();
});

async function createOnce(answer: Response, username = 'carol') {
  fetchMock.mockResolvedValueOnce(answer);
  const before = created.length;
  service.createUser(newUser(username));
  await vi.waitFor(() => expect(created).toHaveLength(before + 1));
  return created.at(-1) as CreateUserResult;
}
async function deleteOnce(answer: Response, username = 'carol') {
  fetchMock.mockResolvedValueOnce(answer);
  const before = deleted.length;
  service.deleteUser(username);
  await vi.waitFor(() => expect(deleted).toHaveLength(before + 1));
  return deleted.at(-1) as DeleteUserResult;
}

describe('UsersService.createUser', () => {
  it('success: username and the generated password; states idle → pending carol → success', async () => {
    const result = await createOnce(json(201, { username: 'carol', password: GENERATED }));
    expect(result).toEqual({ status: 'success', user: { username: 'carol', password: GENERATED } });
    expect(createStates).toEqual([{ status: 'idle' }, { status: 'pending', username: 'carol' }, result]);
    expect(createStates[2]).toBe(result);
  });

  it("request shape: one POST to apiUrl + '/users' with the bearer token and the JSON body", async () => {
    await createOnce(json(201, { username: 'carol', password: GENERATED }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = call(fetchMock);
    expect(url).toBe('http://api.test/users');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'Bearer access-token-admin', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual(newUser('carol'));
  });

  it('the facts are sent as the shared rule makes them: trimmed, the e-mail lower-cased, the line ends of the address made one', async () => {
    fetchMock.mockResolvedValueOnce(json(201, { username: 'carol', password: GENERATED }));
    service.createUser({ username: 'carol', givenName: ' Carol ', familyName: 'Conti ', email: ' Carol@Example.COM', address: ' Via Roma 1\r\n00100 Roma ' });
    await vi.waitFor(() => expect(created).toHaveLength(1));
    expect(JSON.parse(call(fetchMock)[1].body as string)).toEqual(newUser('carol'));
  });

  it('invalid name: pending, then failure invalid_request; fetch never called', () => {
    service.createUser(newUser('Bob'));
    expect(created).toEqual([{ status: 'failure', reason: 'invalid_request', message: expect.stringContaining('3 to 32') }]);
    expect(createStates.map((s) => s.status)).toEqual(['idle', 'pending', 'failure']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a fact that is not one: failure invalid_request naming the field; fetch never called', () => {
    service.createUser({ ...newUser('carol'), email: 'not-an-address' });
    expect(created).toEqual([{ status: 'failure', reason: 'invalid_request', message: 'email: not an e-mail address' }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exists: failure user_exists', async () => {
    expect(await createOnce(json(409, { error: 'user_exists', message: 'A user with this username already exists' }))).toEqual({
      status: 'failure',
      reason: 'user_exists',
      message: 'A user with this username already exists',
    });
  });

  it('forbidden: failure forbidden; the session stays', async () => {
    expect(await createOnce(json(403, { error: 'forbidden', message: 'Not allowed' }))).toMatchObject({ reason: 'forbidden' });
    expect(sessions.at(-1)).toBe(admin);
  });

  it.each([
    ['201 without password', () => json(201, { username: 'carol' })],
    ['200 with both', () => json(200, { username: 'carol', password: GENERATED })],
    ['201 empty', () => new Response(null, { status: 201 })],
  ])('wrong body (%s): failure unexpected', async (_name, stub) => {
    expect(await createOnce(stub())).toMatchObject({ status: 'failure', reason: 'unexpected' });
  });

  it('cancel: a second create aborts the first; one result', async () => {
    let firstSignal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      firstSignal = init.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    service.createUser(newUser('dave'));
    await createOnce(json(201, { username: 'carol', password: GENERATED }));
    expect(firstSignal?.aborted).toBe(true);
    expect(created).toHaveLength(1);
  });

  it('retry after failure: two results, the second a success', async () => {
    await createOnce(json(409, { error: 'user_exists', message: 'exists' }));
    await createOnce(json(201, { username: 'carol', password: GENERATED }));
    expect(created.map((r) => r.status)).toEqual(['failure', 'success']);
  });
});

describe('UsersService.deleteUser', () => {
  it('success: the 204 gives success with the username of the call', async () => {
    const result = await deleteOnce(new Response(null, { status: 204 }));
    expect(result).toEqual({ status: 'success', username: 'carol' });
    expect(deleteStates).toEqual([{ status: 'idle' }, { status: 'pending', username: 'carol' }, result]);
  });

  it("request shape: one DELETE to apiUrl + '/users/carol', bearer token, no body, no Content-Type", async () => {
    await deleteOnce(new Response(null, { status: 204 }));
    const [url, init] = call(fetchMock);
    expect(url).toBe('http://api.test/users/carol');
    expect(init.method).toBe('DELETE');
    expect(init.headers).toEqual({ Authorization: 'Bearer access-token-admin' });
    expect(init.body).toBeUndefined();
  });

  it('invalid name: failure invalid_request; fetch never called', () => {
    service.deleteUser('../admin');
    expect(deleted).toEqual([{ status: 'failure', reason: 'invalid_request', message: expect.any(String) }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('delete admin: failure cannot_delete_admin; the session stays', async () => {
    expect(await deleteOnce(json(403, { error: 'cannot_delete_admin', message: 'Administrators cannot be deleted' }), 'admin')).toMatchObject({
      reason: 'cannot_delete_admin',
    });
    expect(sessions.at(-1)).toBe(admin);
  });

  it('unknown: failure user_not_found', async () => {
    expect(await deleteOnce(json(404, { error: 'user_not_found', message: 'No user' }))).toMatchObject({ reason: 'user_not_found' });
  });

  it('wrong status (200 {}): failure unexpected', async () => {
    expect(await deleteOnce(json(200, {}))).toMatchObject({ reason: 'unexpected' });
  });
});

describe('UsersService, both pairs', () => {
  it('token rejected: failure session_rejected; session$ gives null', async () => {
    expect(await deleteOnce(json(403, { message: 'Forbidden' }))).toMatchObject({ reason: 'session_rejected' });
    expect(sessions.at(-1)).toBeNull();
  });

  it('not signed in: failure not_signed_in; fetch never called', () => {
    store.clear();
    service.createUser(newUser('carol'));
    service.deleteUser('carol');
    expect(created).toEqual([{ status: 'failure', reason: 'not_signed_in', message: 'Nobody is signed in' }]);
    expect(deleted).toEqual([{ status: 'failure', reason: 'not_signed_in', message: 'Nobody is signed in' }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('independent pairs: a delete does not abort a pending create; each result on its own stream', async () => {
    let createSignal: AbortSignal | undefined;
    let answerCreate: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      createSignal = init.signal ?? undefined;
      return new Promise<Response>((resolve) => (answerCreate = resolve));
    });
    service.createUser(newUser('dave'));
    await deleteOnce(new Response(null, { status: 204 }));
    expect(createSignal?.aborted).toBe(false);
    answerCreate(json(201, { username: 'dave', password: GENERATED }));
    await vi.waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({ status: 'success', user: { username: 'dave' } });
    expect(deleted).toEqual([{ status: 'success', username: 'carol' }]);
  });

  it('password only where allowed: in the create success, not in the delete streams nor the store', async () => {
    await createOnce(json(201, { username: 'carol', password: GENERATED }));
    await deleteOnce(new Response(null, { status: 204 }));
    expect(JSON.stringify(created)).toContain(GENERATED);
    expect(JSON.stringify([deleted, deleteStates, sessions])).not.toContain(GENERATED);
  });

  it('no leak: no state or result contains the token', async () => {
    await createOnce(json(201, { username: 'carol', password: GENERATED }));
    await deleteOnce(json(404, { error: 'user_not_found', message: 'No user' }));
    expect(JSON.stringify([created, createStates, deleted, deleteStates])).not.toContain(admin.accessToken);
  });
});

// deleteUser's concurrent_update (docs/FRONTEND_SERVICES.md section 8, decision 37), and listUsers
// through the per-method suite.

describe('UsersService.deleteUser, the calendar lock', () => {
  it('busy lock: failure concurrent_update with the message; the session stays', async () => {
    expect(await deleteOnce(json(409, { error: 'concurrent_update', message: 'The calendar is busy, try again' }))).toEqual({
      status: 'failure',
      reason: 'concurrent_update',
      message: 'The calendar is busy, try again',
    });
    expect(sessions.at(-1)).toBe(admin);
  });
});

const USERS = [
  { username: 'alice', createdAt: '2026-11-01T09:00:00.000Z', status: 'active', ...FACTS, givenName: 'Alice' },
  { username: 'fe-calendar', createdAt: '2026-11-15T09:00:00.000Z', status: 'invited', ...FACTS },
];
const listUsers: MethodSpec<UsersService> = {
  name: 'listUsers',
  result$: (s) => s.listUsersResult$,
  state$: (s) => s.listUsersState$,
  call: (s) => s.listUsers(),
  pending: { status: 'pending' },
  request: { method: 'GET', path: '/users' },
  ok: () => json(200, { users: USERS }),
  success: { status: 'success', users: USERS },
  wrong: [
    ['200 without users', () => json(200, {})],
    ['an element without username', () => json(200, { users: [{ ...USERS[0], username: undefined }] })],
    ['an element without its e-mail', () => json(200, { users: [{ ...USERS[0], email: undefined }] })],
    ['an element with a name that is no text', () => json(200, { users: [{ ...USERS[0], familyName: 7 }] })],
    ['201', () => json(201, { users: USERS })],
  ],
  codes: ['forbidden', 'internal_error'],
  notCodes: ['user_not_found'],
};
const deleteForCancel: MethodSpec<UsersService> = { ...listUsers, name: 'deleteUser', call: (s) => s.deleteUser('carol') };

describeMethod((store) => new UsersService(CONFIG, store), listUsers, deleteForCancel);

// PUT /users/{username} (docs/FRONTEND_SERVICES.md section 13.1): the four facts of one user.
const UPDATED = { ...USERS[0] };
const updateUser: MethodSpec<UsersService> = {
  name: 'updateUser',
  result$: (s) => s.updateUserResult$,
  state$: (s) => s.updateUserState$,
  call: (s) => s.updateUser('alice', { ...FACTS, givenName: ' Alice ' }),
  pending: { status: 'pending', username: 'alice' },
  request: { method: 'PUT', path: '/users/alice', body: { ...FACTS, givenName: 'Alice' } },
  ok: () => json(200, UPDATED),
  success: { status: 'success', user: UPDATED },
  wrong: [
    ['200 without the e-mail', () => json(200, { ...UPDATED, email: undefined })],
    ['200 empty', () => new Response(null, { status: 200 })],
    ['201', () => json(201, UPDATED)],
  ],
  codes: ['forbidden', 'invalid_json', 'invalid_request', 'user_not_found', 'cannot_edit_admin', 'internal_error'],
  notCodes: ['cannot_delete_admin'],
  invalid: [
    ['a username that is not one', (s) => s.updateUser('../admin', FACTS), expect.stringContaining('3 to 32') as unknown as string],
    ['an empty first name', (s) => s.updateUser('alice', { ...FACTS, givenName: '  ' }), expect.stringMatching(/^givenName: /) as unknown as string],
    ['an address too long', (s) => s.updateUser('alice', { ...FACTS, address: 'x'.repeat(301) }), expect.stringMatching(/^address: /) as unknown as string],
  ],
};

describeMethod((store) => new UsersService(CONFIG, store), updateUser, listUsers);
