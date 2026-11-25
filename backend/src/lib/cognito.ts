import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AdminUserGlobalSignOutCommand,
  type AttributeType,
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
  type UserStatusType,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';
import type { MeResponse, UserProfile, UserStatus, UserSummary } from '@shared-calendar/shared';

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

// The four facts about a person and the standard Cognito attribute that holds each one
// (docs/EMAIL_ARCHITECTURE.md section 4.1). They are standard attributes, so the pool's schema
// does not list them.
const PROFILE_ATTRIBUTES = { givenName: 'given_name', familyName: 'family_name', email: 'email', address: 'address' } as const satisfies Record<keyof UserProfile, string>;

// The facts as Cognito attributes, the e-mail lower-cased. `email_verified` is true because the
// Administrator typed the address: there is no verification code to send
// (docs/EMAIL_ARCHITECTURE.md section 4.1).
function profileAttributes(profile: UserProfile): AttributeType[] {
  return [
    { Name: PROFILE_ATTRIBUTES.givenName, Value: profile.givenName },
    { Name: PROFILE_ATTRIBUTES.familyName, Value: profile.familyName },
    { Name: PROFILE_ATTRIBUTES.email, Value: profile.email.toLowerCase() },
    { Name: PROFILE_ATTRIBUTES.address, Value: profile.address },
    { Name: 'email_verified', Value: 'true' },
  ];
}

// The facts an account holds, each null when its attribute is missing or empty.
type StoredFacts = { [Fact in keyof UserProfile]: string | null };

function storedFacts(attributes: AttributeType[] | undefined): StoredFacts {
  const value = (name: string) => attributes?.find((attribute) => attribute.Name === name)?.Value || null;
  return {
    givenName: value(PROFILE_ATTRIBUTES.givenName),
    familyName: value(PROFILE_ATTRIBUTES.familyName),
    email: value(PROFILE_ATTRIBUTES.email),
    address: value(PROFILE_ATTRIBUTES.address),
  };
}

// The state of an account as the page shows it (docs/EMAIL_PLAN.md finding F11): an account that
// must still change its first password is `invited`, any other state `active`.
function statusOf(status: UserStatusType | string | undefined): UserStatus {
  return status === 'FORCE_CHANGE_PASSWORD' ? 'invited' : 'active';
}

// The four facts of a User, all of them. Every User has them from its creation
// (docs/EMAIL_ARCHITECTURE.md section 4.3): a User without one is a broken directory, an ordinary
// error (500). The error names the missing facts, never a value.
function requiredFacts(username: string, facts: StoredFacts): UserProfile {
  const { givenName, familyName, email, address } = facts;
  if (givenName !== null && familyName !== null && email !== null && address !== null) return { givenName, familyName, email, address };
  const missing = Object.entries(facts).flatMap(([fact, held]) => (held === null ? [fact] : []));
  throw new Error(`User ${username} lacks ${missing.join(', ')}`);
}

// A member of a group as GET /users answers it. A member without a username or a creation date is
// a broken directory: an ordinary error (500).
function summaryOf(user: UserType): UserSummary {
  if (!user.Username || !user.UserCreateDate) throw new Error('A member of group user has no username or creation date');
  const facts = requiredFacts(user.Username, storedFacts(user.Attributes));
  return { username: user.Username, createdAt: user.UserCreateDate.toISOString(), status: statusOf(user.UserStatus), ...facts };
}

// MessageAction SUPPRESS: Cognito sends no invitation; the handler sets a permanent password.
export async function createUser(username: string, profile: UserProfile): Promise<void> {
  await cognitoClient
    .send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId(),
        Username: username,
        MessageAction: 'SUPPRESS',
        UserAttributes: profileAttributes(profile),
      }),
    )
    .catch((err: unknown) => mapError(err, username));
}

// Replaces the four facts of an account (AdminUpdateUserAttributes). The pool verifies no
// attribute by itself, so a new e-mail sends nothing.
export async function updateProfile(username: string, profile: UserProfile): Promise<void> {
  await cognitoClient
    .send(new AdminUpdateUserAttributesCommand({ UserPoolId: userPoolId(), Username: username, UserAttributes: profileAttributes(profile) }))
    .catch((err: unknown) => mapError(err, username));
}

/** One account read whole (AdminGetUser): its facts, each null when missing, its state and creation date. */
export type StoredAccount = { username: string; createdAt: string; status: UserStatus } & StoredFacts;

// An account read by AdminGetUser. The facts may be missing: the Administrator's account exists
// before its facts are typed (docs/EMAIL_ARCHITECTURE.md section 4.3). An answer without a
// creation date is a broken directory: an ordinary error (500).
export async function getProfile(username: string): Promise<StoredAccount> {
  const result = await cognitoClient
    .send(new AdminGetUserCommand({ UserPoolId: userPoolId(), Username: username }))
    .catch((err: unknown) => mapError(err, username));
  if (!result.UserCreateDate) throw new Error(`User ${username} has no creation date`);
  return { username, createdAt: result.UserCreateDate.toISOString(), status: statusOf(result.UserStatus), ...storedFacts(result.UserAttributes) };
}

/** A stored account as a User of GET /users: every fact required (a missing one is a 500). */
export function asUserSummary(account: StoredAccount): UserSummary {
  const { username, createdAt, status, ...facts } = account;
  return { username, createdAt, status, ...requiredFacts(username, facts) };
}

/** A stored account as GET /me answers it, with the role the token gives. */
export function asMe(account: StoredAccount, role: MeResponse['role']): MeResponse {
  return { username: account.username, role, givenName: account.givenName, familyName: account.familyName, email: account.email, address: account.address };
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
// (docs/SHARED_CALENDAR_SPEC.md section 10.1), `createdAt` from UserCreateDate as an ISO instant,
// the four facts and the state from the same answer, with no call per User. A member without a
// username, a creation date or one of the facts is a broken directory: an ordinary error (500).
export async function listPlainUsers(): Promise<UserSummary[]> {
  const [users, admins] = await Promise.all([membersOf('user'), membersOf('admin')]);
  const adminNames = new Set(admins.map((a) => a.Username));
  return users
    .filter((u) => !adminNames.has(u.Username))
    .map(summaryOf)
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
