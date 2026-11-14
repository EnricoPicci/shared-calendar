import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminSetUserPasswordCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import { mockClient } from 'aws-sdk-client-mock';
import {
  addToGroup,
  createUser,
  deleteUser,
  getUserSub,
  globalSignOut,
  isPlainUser,
  listGroups,
  setPermanentPassword,
  UserExistsError,
  UserNotFoundError,
} from '../../../src/lib/cognito';

const cognito = mockClient(CognitoIdentityProviderClient);
const POOL = 'eu-west-1_TEST';

const notFound = () => new UserNotFoundException({ message: 'User does not exist.', $metadata: {} });
const exists = () => new UsernameExistsException({ message: 'User account already exists', $metadata: {} });

beforeEach(() => {
  cognito.reset();
  vi.stubEnv('USER_POOL_ID', POOL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createUser', () => {
  it('sends AdminCreateUser with MessageAction SUPPRESS and no other attributes', async () => {
    cognito.on(AdminCreateUserCommand).resolves({});
    await createUser('bob');
    const calls = cognito.commandCalls(AdminCreateUserCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[0].input).toEqual({ UserPoolId: POOL, Username: 'bob', MessageAction: 'SUPPRESS' });
  });

  it('maps UsernameExistsException to UserExistsError', async () => {
    cognito.on(AdminCreateUserCommand).rejects(exists());
    await expect(createUser('bob')).rejects.toBeInstanceOf(UserExistsError);
  });

  it('fails clearly when USER_POOL_ID is not set', async () => {
    vi.stubEnv('USER_POOL_ID', '');
    await expect(createUser('bob')).rejects.toThrow('USER_POOL_ID is not set');
    expect(cognito.calls()).toHaveLength(0);
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
    await expect(createUser('bob')).rejects.toBe(throttled);
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
