import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminSetUserPasswordCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';
import type { UserSummary } from '@shared-calendar/shared';

export class UserExistsError extends Error {
  constructor(username: string) {
    super(`User ${username} already exists`);
    this.name = 'UserExistsError';
  }
}

export class UserNotFoundError extends Error {
  constructor(username: string) {
    super(`User ${username} not found`);
    this.name = 'UserNotFoundError';
  }
}

// Built once per container and reused across invocations. COGNITO_ENDPOINT points at
// cognito-local; in the cloud the template sets it to '' and the SDK default applies.
export const cognitoClient = new CognitoIdentityProviderClient({
  endpoint: process.env.COGNITO_ENDPOINT || undefined,
});

function userPoolId(): string {
  const id = process.env.USER_POOL_ID;
  if (!id) throw new Error('USER_POOL_ID is not set');
  return id;
}

// Turns the two Cognito errors the handlers react to into our own types; anything else
// is rethrown unchanged and ends up as a 500.
function mapError(err: unknown, username: string): never {
  const name = (err as { name?: unknown } | null)?.name;
  if (name === 'UsernameExistsException') throw new UserExistsError(username);
  if (name === 'UserNotFoundException') throw new UserNotFoundError(username);
  throw err;
}

// MessageAction SUPPRESS: Cognito sends no invitation (no e-mail in v1).
export async function createUser(username: string): Promise<void> {
  await cognitoClient
    .send(new AdminCreateUserCommand({ UserPoolId: userPoolId(), Username: username, MessageAction: 'SUPPRESS' }))
    .catch((err: unknown) => mapError(err, username));
}

// Permanent: true, so the first sign-in has no password-change challenge.
export async function setPermanentPassword(username: string, password: string): Promise<void> {
  await cognitoClient
    .send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId(),
        Username: username,
        Password: password,
        Permanent: true,
      }),
    )
    .catch((err: unknown) => mapError(err, username));
}

// Only 'user' is accepted: the API must never be able to make an administrator.
export async function addToGroup(username: string, group: 'user'): Promise<void> {
  await cognitoClient
    .send(new AdminAddUserToGroupCommand({ UserPoolId: userPoolId(), Username: username, GroupName: group }))
    .catch((err: unknown) => mapError(err, username));
}

// One page is enough: the pool has two groups, far below the page size.
export async function listGroups(username: string): Promise<string[]> {
  const result = await cognitoClient
    .send(new AdminListGroupsForUserCommand({ UserPoolId: userPoolId(), Username: username }))
    .catch((err: unknown) => mapError(err, username));
  return (result.Groups ?? []).flatMap((group) => (group.GroupName ? [group.GroupName] : []));
}

// The account's Cognito `sub`, the id the calendar stores as `userId`
// (docs/SHARED_CALENDAR_SPEC.md sections 8.1 and 15.4). Every account has one (Cognito and
// cognito-local set it at AdminCreateUser); an answer without it is a broken directory, not a
// missing user, so it is an ordinary error (a 500).
export async function getUserSub(username: string): Promise<string> {
  const result = await cognitoClient
    .send(new AdminGetUserCommand({ UserPoolId: userPoolId(), Username: username }))
    .catch((err: unknown) => mapError(err, username));
  const sub = result.UserAttributes?.find((attribute) => attribute.Name === 'sub')?.Value;
  if (!sub) throw new Error(`User ${username} has no sub attribute`);
  return sub;
}

// A plain User: in group 'user' and not in 'admin' (admin wins, docs/ARCHITECTURE.md section 3).
// An account in neither group is not one either (docs/SHARED_CALENDAR_SPEC.md R-BOOK-01). An
// unknown username is UserNotFoundError.
export async function isPlainUser(username: string): Promise<boolean> {
  const groups = await listGroups(username);
  return groups.includes('user') && !groups.includes('admin');
}

// Every member of one group, following NextToken to the last page (real Cognito pages by 60;
// cognito-local answers everything at once, without a NextToken).
async function membersOf(group: 'user' | 'admin'): Promise<UserType[]> {
  const members: UserType[] = [];
  let token: string | undefined;
  do {
    const page = await cognitoClient.send(new ListUsersInGroupCommand({ UserPoolId: userPoolId(), GroupName: group, NextToken: token }));
    members.push(...(page.Users ?? []));
    token = page.NextToken;
  } while (token);
  return members;
}

// The plain Users for GET /users (docs/SHARED_CALENDAR_SPEC.md section 10.1 and section 11.1,
// route 21): the members of 'user' that are not in 'admin' (admin wins, docs/ARCHITECTURE.md section 3);
// an account in no group is not one. Sorted by username in UTF-16 code-unit order
// (docs/SHARED_CALENDAR_SPEC.md section 10.1), `createdAt` from UserCreateDate as an ISO instant.
// A member without a username or a creation date is a broken directory: an ordinary error (500).
export async function listPlainUsers(): Promise<UserSummary[]> {
  const [users, admins] = await Promise.all([membersOf('user'), membersOf('admin')]);
  const adminNames = new Set(admins.map((a) => a.Username));
  return users
    .filter((u) => !adminNames.has(u.Username))
    .map((u): UserSummary => {
      if (!u.Username || !u.UserCreateDate) throw new Error('A member of group user has no username or creation date');
      return { username: u.Username, createdAt: u.UserCreateDate.toISOString() };
    })
    .sort((a, b) => (a.username < b.username ? -1 : a.username > b.username ? 1 : 0));
}

// Revokes the user's refresh tokens.
//
// SKIP_GLOBAL_SIGN_OUT exists only because the local Cognito emulator (cognito-local 5.3.0)
// does not implement AdminUserGlobalSignOut: it answers "Unsupported", the handler turns that
// into a 500, and no user could ever be deleted locally. scripts/local-seed.sh sets it to
// 'true' in env.local.json for sam local only. template.yaml leaves it empty, so in the cloud
// the sign-out always runs and the post-deploy smoke test exercises it against real Cognito.
// Never set it in the cloud: deleted users' refresh tokens would not be revoked.
export async function globalSignOut(username: string): Promise<void> {
  if (process.env.SKIP_GLOBAL_SIGN_OUT === 'true') return;
  await cognitoClient
    .send(new AdminUserGlobalSignOutCommand({ UserPoolId: userPoolId(), Username: username }))
    .catch((err: unknown) => mapError(err, username));
}

export async function deleteUser(username: string): Promise<void> {
  await cognitoClient
    .send(new AdminDeleteUserCommand({ UserPoolId: userPoolId(), Username: username }))
    .catch((err: unknown) => mapError(err, username));
}
