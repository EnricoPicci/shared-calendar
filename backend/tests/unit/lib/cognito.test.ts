import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
  UsernameExistsException,
  UserNotFoundException,
  type UserStatusType,
} from '@aws-sdk/client-cognito-identity-provider';
import { mockClient } from 'aws-sdk-client-mock';
import {
  addToGroup,
  adminRecipients,
  asMe,
  asUserSummary,
  createUser,
  deleteUser,
  getProfile,
  getUserSub,
  globalSignOut,
  isPlainUser,
  listGroups,
  listPlainUsers,
  namesBySub,
  setPermanentPassword,
  updateProfile,
  UserExistsError,
  UserNotFoundError,
} from '../../../src/lib/cognito';

const cognito = mockClient(CognitoIdentityProviderClient);
const POOL = 'eu-west-1_TEST';

const notFound = () => new UserNotFoundException({ message: 'User does not exist.', $metadata: {} });
const exists = () => new UsernameExistsException({ message: 'User account already exists', $metadata: {} });

// A person's four facts, and the attributes Cognito holds them in.
const FACTS = { givenName: 'Anna', familyName: 'Rossi', email: 'anna.rossi@example.com', address: 'Via Roma 1\n00100 Roma' };
const factAttributes = (facts = FACTS) => [
  { Name: 'given_name', Value: facts.givenName },
  { Name: 'family_name', Value: facts.familyName },
  { Name: 'email', Value: facts.email },
  { Name: 'address', Value: facts.address },
];

beforeEach(() => {
  cognito.reset();
  vi.stubEnv('USER_POOL_ID', POOL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createUser', () => {
  it('sends AdminCreateUser with MessageAction SUPPRESS and the four facts, the e-mail verified', async () => {
    cognito.on(AdminCreateUserCommand).resolves({});
    await createUser('bob', FACTS);
    const calls = cognito.commandCalls(AdminCreateUserCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[0].input).toEqual({
      UserPoolId: POOL,
      Username: 'bob',
      MessageAction: 'SUPPRESS',
      UserAttributes: [...factAttributes(), { Name: 'email_verified', Value: 'true' }],
    });
  });

  it('lower-cases the e-mail', async () => {
    cognito.on(AdminCreateUserCommand).resolves({});
    await createUser('bob', { ...FACTS, email: 'Anna.Rossi@Example.COM' });
    expect(cognito.commandCalls(AdminCreateUserCommand)[0]!.args[0].input.UserAttributes).toContainEqual({ Name: 'email', Value: 'anna.rossi@example.com' });
  });

  it('maps UsernameExistsException to UserExistsError', async () => {
    cognito.on(AdminCreateUserCommand).rejects(exists());
    await expect(createUser('bob', FACTS)).rejects.toBeInstanceOf(UserExistsError);
  });

  it('fails clearly when USER_POOL_ID is not set', async () => {
    vi.stubEnv('USER_POOL_ID', '');
    await expect(createUser('bob', FACTS)).rejects.toThrow('USER_POOL_ID is not set');
    expect(cognito.calls()).toHaveLength(0);
  });
});

describe('updateProfile', () => {
  it('sends AdminUpdateUserAttributes with the four facts, the e-mail lower-cased and verified', async () => {
    cognito.on(AdminUpdateUserAttributesCommand).resolves({});
    await updateProfile('bob', { ...FACTS, email: 'ANNA.ROSSI@example.com' });
    expect(cognito.commandCalls(AdminUpdateUserAttributesCommand)[0]!.args[0].input).toEqual({
      UserPoolId: POOL,
      Username: 'bob',
      UserAttributes: [...factAttributes(), { Name: 'email_verified', Value: 'true' }],
    });
  });

  it('maps UserNotFoundException to UserNotFoundError', async () => {
    cognito.on(AdminUpdateUserAttributesCommand).rejects(notFound());
    await expect(updateProfile('ghost', FACTS)).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

describe('getProfile', () => {
  const created = new Date(Date.UTC(2026, 10, 25, 9));

  it('sends AdminGetUser and answers the facts, the state and the creation date', async () => {
    cognito
      .on(AdminGetUserCommand, { UserPoolId: POOL, Username: 'bob' })
      .resolves({ Username: 'bob', UserCreateDate: created, UserStatus: 'CONFIRMED', UserAttributes: [{ Name: 'sub', Value: 's-1' }, ...factAttributes()] });
    expect(await getProfile('bob')).toEqual({ username: 'bob', createdAt: '2026-11-25T09:00:00.000Z', status: 'active', ...FACTS });
  });

  it('answers invited for an account that must change its first password', async () => {
    cognito.on(AdminGetUserCommand).resolves({ UserCreateDate: created, UserStatus: 'FORCE_CHANGE_PASSWORD', UserAttributes: factAttributes() });
    expect((await getProfile('bob')).status).toBe('invited');
  });

  it('answers null for a fact the account does not hold, or holds empty', async () => {
    cognito.on(AdminGetUserCommand).resolves({ UserCreateDate: created, UserAttributes: [{ Name: 'email', Value: '' }, { Name: 'given_name', Value: 'Anna' }] });
    expect(await getProfile('admin')).toEqual({
      username: 'admin',
      createdAt: '2026-11-25T09:00:00.000Z',
      status: 'active',
      givenName: 'Anna',
      familyName: null,
      email: null,
      address: null,
    });
  });

  it('answers null for every fact when the answer has no attributes', async () => {
    cognito.on(AdminGetUserCommand).resolves({ UserCreateDate: created });
    expect(await getProfile('admin')).toMatchObject({ givenName: null, familyName: null, email: null, address: null });
  });

  it('fails as an ordinary error when the answer has no creation date', async () => {
    cognito.on(AdminGetUserCommand).resolves({ UserAttributes: factAttributes() });
    await expect(getProfile('bob')).rejects.toThrow('User bob has no creation date');
  });

  it('maps UserNotFoundException to UserNotFoundError', async () => {
    cognito.on(AdminGetUserCommand).rejects(notFound());
    await expect(getProfile('ghost')).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

describe('asUserSummary and asMe', () => {
  const account = { username: 'bob', createdAt: '2026-11-25T09:00:00.000Z', status: 'active' as const, ...FACTS };

  it('makes a User of GET /users from a stored account', () => {
    expect(asUserSummary(account)).toEqual(account);
  });

  it('refuses an account without every fact, naming the missing ones and no value', () => {
    expect(() => asUserSummary({ ...account, email: null, address: null })).toThrow('User bob lacks email, address');
  });

  it('makes the answer of GET /me, with the role and the missing facts as null', () => {
    expect(asMe({ ...account, familyName: null }, 'admin')).toEqual({ username: 'bob', role: 'admin', ...FACTS, familyName: null });
  });
});

describe('setPermanentPassword', () => {
  it('sends AdminSetUserPassword with Permanent true', async () => {
    cognito.on(AdminSetUserPasswordCommand).resolves({});
    await setPermanentPassword('bob', 'Pass-Word-1234!x');
    expect(cognito.commandCalls(AdminSetUserPasswordCommand)[0]!.args[0].input).toEqual({
      UserPoolId: POOL,
      Username: 'bob',
      Password: 'Pass-Word-1234!x',
      Permanent: true,
    });
  });

  it('maps UserNotFoundException to UserNotFoundError', async () => {
    cognito.on(AdminSetUserPasswordCommand).rejects(notFound());
    await expect(setPermanentPassword('bob', 'x')).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

describe('addToGroup', () => {
  it('sends AdminAddUserToGroup for the user group', async () => {
    cognito.on(AdminAddUserToGroupCommand).resolves({});
    await addToGroup('bob', 'user');
    expect(cognito.commandCalls(AdminAddUserToGroupCommand)[0]!.args[0].input).toEqual({
      UserPoolId: POOL,
      Username: 'bob',
      GroupName: 'user',
    });
  });

  it('maps UserNotFoundException to UserNotFoundError', async () => {
    cognito.on(AdminAddUserToGroupCommand).rejects(notFound());
    await expect(addToGroup('bob', 'user')).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('only accepts the user group at compile time', () => {
    // @ts-expect-error the API must never add anyone to the admin group
    const call = () => addToGroup('bob', 'admin');
    expect(call).toBeTypeOf('function');
  });
});

describe('listGroups', () => {
  it('returns the group names', async () => {
    cognito
      .on(AdminListGroupsForUserCommand, { UserPoolId: POOL, Username: 'bob' })
      .resolves({ Groups: [{ GroupName: 'admin' }, { GroupName: 'user' }, {}] });
    expect(await listGroups('bob')).toEqual(['admin', 'user']);
  });

  it('returns an empty list when Cognito omits Groups', async () => {
    cognito.on(AdminListGroupsForUserCommand).resolves({});
    expect(await listGroups('bob')).toEqual([]);
  });

  it('maps UserNotFoundException to UserNotFoundError', async () => {
    cognito.on(AdminListGroupsForUserCommand).rejects(notFound());
    await expect(listGroups('ghost')).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

describe('getUserSub', () => {
  it('sends AdminGetUser and returns the sub attribute', async () => {
    cognito.on(AdminGetUserCommand).resolves({
      Username: 'bob',
      UserAttributes: [
        { Name: 'email_verified', Value: 'false' },
        { Name: 'sub', Value: 'c0a8-sub-of-bob' },
      ],
    });
    await expect(getUserSub('bob')).resolves.toBe('c0a8-sub-of-bob');
    const calls = cognito.commandCalls(AdminGetUserCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[0].input).toEqual({ UserPoolId: POOL, Username: 'bob' });
  });

  it('fails as an ordinary error when the answer has no sub attribute', async () => {
    cognito.on(AdminGetUserCommand).resolves({ Username: 'bob', UserAttributes: [{ Name: 'email', Value: 'b@example.com' }] });
    const err = await getUserSub('bob').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(UserNotFoundError);
    expect((err as Error).message).toBe('User bob has no sub attribute');
  });

  it('fails as an ordinary error when the answer has no attributes at all', async () => {
    cognito.on(AdminGetUserCommand).resolves({ Username: 'bob' });
    await expect(getUserSub('bob')).rejects.toThrow('User bob has no sub attribute');
  });

  it('maps UserNotFoundException to UserNotFoundError', async () => {
    cognito.on(AdminGetUserCommand).rejects(notFound());
    await expect(getUserSub('ghost')).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

describe('isPlainUser', () => {
  const groups = (...names: string[]) => cognito.on(AdminListGroupsForUserCommand).resolves({ Groups: names.map((GroupName) => ({ GroupName })) });

  it('is true for an account in group user only', async () => {
    groups('user');
    await expect(isPlainUser('bob')).resolves.toBe(true);
    expect(cognito.commandCalls(AdminListGroupsForUserCommand)[0]!.args[0].input).toEqual({ UserPoolId: POOL, Username: 'bob' });
  });

  it('is false for an account in group admin only', async () => {
    groups('admin');
    await expect(isPlainUser('admin')).resolves.toBe(false);
  });

  it('is false for an account in both groups: admin wins', async () => {
    groups('user', 'admin');
    await expect(isPlainUser('both')).resolves.toBe(false);
  });

  it('is false for an account in neither group', async () => {
    groups();
    await expect(isPlainUser('orphan')).resolves.toBe(false);
  });

  it('maps UserNotFoundException to UserNotFoundError', async () => {
    cognito.on(AdminListGroupsForUserCommand).rejects(notFound());
    await expect(isPlainUser('ghost')).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

describe('listPlainUsers', () => {
  const member = (Username: string, day: number, UserStatus: UserStatusType = 'CONFIRMED') => ({
    Username,
    UserCreateDate: new Date(Date.UTC(2026, 10, day, 8)),
    UserStatus,
    Attributes: factAttributes({ ...FACTS, givenName: Username }),
  });
  const pageOf = (group: string, token: string | undefined, users: ReturnType<typeof member>[], next?: string) =>
    cognito
      .on(ListUsersInGroupCommand, { UserPoolId: POOL, GroupName: group, NextToken: token })
      .resolves({ Users: users, ...(next && { NextToken: next }) });

  it('follows NextToken in both groups, keeps the members of user not in admin, sorted by username', async () => {
    pageOf('user', undefined, [member('erin', 3), member('dave', 2)], 'u2');
    pageOf('user', 'u2', [member('both', 1), member('alice', 4)], 'u3');
    pageOf('user', 'u3', [member('carol.b', 5), member('carol-a', 6, 'FORCE_CHANGE_PASSWORD')]);
    pageOf('admin', undefined, [member('admin', 1)], 'a2');
    pageOf('admin', 'a2', [member('both', 1)]);

    const users = await listPlainUsers();

    const user = (username: string, createdAt: string, status = 'active') => ({ username, createdAt, status, ...FACTS, givenName: username });
    expect(users).toEqual([
      user('alice', '2026-11-04T08:00:00.000Z'),
      user('carol-a', '2026-11-06T08:00:00.000Z', 'invited'),
      user('carol.b', '2026-11-05T08:00:00.000Z'),
      user('dave', '2026-11-02T08:00:00.000Z'),
      user('erin', '2026-11-03T08:00:00.000Z'),
    ]);
    const calls = cognito.commandCalls(ListUsersInGroupCommand).map((c) => c.args[0].input);
    expect(calls).toHaveLength(5);
    expect(calls).toContainEqual({ UserPoolId: POOL, GroupName: 'user', NextToken: 'u3' });
    expect(calls).toContainEqual({ UserPoolId: POOL, GroupName: 'admin', NextToken: 'a2' });
  });

  it('answers an empty list when the groups have no members (Users omitted)', async () => {
    cognito.on(ListUsersInGroupCommand).resolves({});
    expect(await listPlainUsers()).toEqual([]);
  });

  it('fails as an ordinary error for a member without a creation date', async () => {
    pageOf('user', undefined, [{ Username: 'dave' } as ReturnType<typeof member>]);
    pageOf('admin', undefined, []);
    await expect(listPlainUsers()).rejects.toThrow('A member of group user has no username or creation date');
  });

  it('fails as an ordinary error for a member without one of the facts', async () => {
    pageOf('user', undefined, [{ ...member('dave', 2), Attributes: factAttributes().slice(0, 2) }]);
    pageOf('admin', undefined, []);
    await expect(listPlainUsers()).rejects.toThrow('User dave lacks email, address');
  });

  it('fails as an ordinary error for a member without attributes', async () => {
    pageOf('user', undefined, [{ ...member('dave', 2), Attributes: undefined } as unknown as ReturnType<typeof member>]);
    pageOf('admin', undefined, []);
    await expect(listPlainUsers()).rejects.toThrow('User dave lacks givenName, familyName, email, address');
  });

  it('rethrows a Cognito failure unchanged', async () => {
    cognito.on(ListUsersInGroupCommand).rejects(new Error('boom'));
    await expect(listPlainUsers()).rejects.toThrow('boom');
  });
});

describe('globalSignOut', () => {
  it('sends AdminUserGlobalSignOut', async () => {
    cognito.on(AdminUserGlobalSignOutCommand).resolves({});
    await globalSignOut('bob');
    expect(cognito.commandCalls(AdminUserGlobalSignOutCommand)[0]!.args[0].input).toEqual({
      UserPoolId: POOL,
      Username: 'bob',
    });
  });

  it('maps UserNotFoundException to UserNotFoundError', async () => {
    cognito.on(AdminUserGlobalSignOutCommand).rejects(notFound());
    await expect(globalSignOut('ghost')).rejects.toBeInstanceOf(UserNotFoundError);
  });

  // Local-only switch for cognito-local, which lacks AdminUserGlobalSignOut.
  it('sends nothing when SKIP_GLOBAL_SIGN_OUT is true', async () => {
    vi.stubEnv('SKIP_GLOBAL_SIGN_OUT', 'true');
    await globalSignOut('bob');
    expect(cognito.calls()).toHaveLength(0);
  });

  it.each([[''], ['false'], ['1']])('still signs out when SKIP_GLOBAL_SIGN_OUT is %j', async (value) => {
    vi.stubEnv('SKIP_GLOBAL_SIGN_OUT', value);
    cognito.on(AdminUserGlobalSignOutCommand).resolves({});
    await globalSignOut('bob');
    expect(cognito.commandCalls(AdminUserGlobalSignOutCommand)).toHaveLength(1);
  });
});

describe('deleteUser', () => {
  it('sends AdminDeleteUser', async () => {
    cognito.on(AdminDeleteUserCommand).resolves({});
    await deleteUser('bob');
    expect(cognito.commandCalls(AdminDeleteUserCommand)[0]!.args[0].input).toEqual({
      UserPoolId: POOL,
      Username: 'bob',
    });
  });

  it('maps UserNotFoundException to UserNotFoundError', async () => {
    cognito.on(AdminDeleteUserCommand).rejects(notFound());
    await expect(deleteUser('ghost')).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

describe('error mapping', () => {
  it('matches by error name, as the emulator and the SDK both set it', async () => {
    cognito.on(AdminDeleteUserCommand).rejects(Object.assign(new Error('gone'), { name: 'UserNotFoundException' }));
    await expect(deleteUser('ghost')).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('rethrows any other error unchanged', async () => {
    const throttled = Object.assign(new Error('Rate exceeded'), { name: 'TooManyRequestsException' });
    cognito.on(AdminCreateUserCommand).rejects(throttled);
    await expect(createUser('bob', FACTS)).rejects.toBe(throttled);
  });

  it('rethrows a non-Error rejection unchanged', async () => {
    cognito.on(AdminDeleteUserCommand).callsFake(() => Promise.reject(null));
    await expect(deleteUser('bob')).rejects.toBeNull();
  });
});

describe('client endpoint', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('uses COGNITO_ENDPOINT when it is set', async () => {
    vi.stubEnv('COGNITO_ENDPOINT', 'http://cognito:9229');
    vi.resetModules();
    const { cognitoClient } = await import('../../../src/lib/cognito');
    const endpoint = await cognitoClient.config.endpoint?.();
    expect(endpoint?.hostname).toBe('cognito');
    expect(endpoint?.port).toBe(9229);
  });

  it('leaves the SDK default when COGNITO_ENDPOINT is empty, as in the cloud', async () => {
    vi.stubEnv('COGNITO_ENDPOINT', '');
    vi.resetModules();
    const { cognitoClient } = await import('../../../src/lib/cognito');
    expect(cognitoClient.config.endpoint).toBeUndefined();
  });
});

describe('namesBySub', () => {
  const member = (sub: string | null, givenName: string | null, familyName: string | null) => ({
    Username: `u-${String(sub)}`,
    Attributes: [
      ...(sub === null ? [] : [{ Name: 'sub', Value: sub }]),
      ...(givenName === null ? [] : [{ Name: 'given_name', Value: givenName }]),
      ...(familyName === null ? [] : [{ Name: 'family_name', Value: familyName }]),
    ],
  });

  it("maps every member of group user to their names by sub, following NextToken; a gap is empty, a member without a sub left out", async () => {
    cognito.on(ListUsersInGroupCommand, { UserPoolId: POOL, GroupName: 'user', NextToken: undefined }).resolves({ Users: [member('s1', 'Anna', 'Rossi')], NextToken: 'n2' });
    cognito.on(ListUsersInGroupCommand, { UserPoolId: POOL, GroupName: 'user', NextToken: 'n2' }).resolves({ Users: [member('s2', null, 'Verdi'), member(null, 'Nobody', 'Here')] });

    const names = await namesBySub();

    expect([...names]).toEqual([
      ['s1', { givenName: 'Anna', familyName: 'Rossi' }],
      ['s2', { givenName: '', familyName: 'Verdi' }],
    ]);
    expect(cognito.commandCalls(ListUsersInGroupCommand).map((c) => c.args[0].input.GroupName)).toEqual(['user', 'user']);
  });
});

describe('adminRecipients', () => {
  const admin = (username: string | undefined, email: string | null) => ({
    Username: username,
    Attributes: [{ Name: 'sub', Value: `sub-${String(username)}` }, ...(email === null ? [] : [{ Name: 'email', Value: email }])],
  });

  it('answers every member of group admin by username, following NextToken, with the e-mail or null', async () => {
    cognito.on(ListUsersInGroupCommand, { UserPoolId: POOL, GroupName: 'admin', NextToken: undefined }).resolves({ Users: [admin('zeta', 'z@example.com')], NextToken: 'n2' });
    cognito.on(ListUsersInGroupCommand, { UserPoolId: POOL, GroupName: 'admin', NextToken: 'n2' }).resolves({ Users: [admin('admin', null), admin('boss', 'b@example.com')] });

    await expect(adminRecipients()).resolves.toEqual([
      { username: 'admin', email: null },
      { username: 'boss', email: 'b@example.com' },
      { username: 'zeta', email: 'z@example.com' },
    ]);
  });

  it('answers none for an empty group, and throws for a member without a username', async () => {
    cognito.on(ListUsersInGroupCommand).resolves({});
    await expect(adminRecipients()).resolves.toEqual([]);
    cognito.on(ListUsersInGroupCommand).resolves({ Users: [admin(undefined, 'x@example.com'), admin('admin', null)] });
    await expect(adminRecipients()).rejects.toThrow('A member of group admin has no username');
  });
});
