import { z } from 'zod';
import type { Role } from './roles';

// One user account: the username rule, the four facts every person has, the bodies that carry
// them, the answer of GET /me and the account's state (docs/EMAIL_ARCHITECTURE.md section 4).

// 3 to 32 characters, lowercase, starting with a letter or digit (docs/ARCHITECTURE.md section 4).
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const Username = z.string().regex(USERNAME_PATTERN, 'invalid username');

// An object rather than the bare string, so that a rejection names the field
// ("Invalid input: username") instead of "(root)".
export const UsernameParam = z.object({ username: Username });
export type UsernameParam = z.infer<typeof UsernameParam>;

// The lengths of the four facts (docs/EMAIL_ARCHITECTURE.md section 4.1), in JavaScript string
// length (UTF-16 code units, what a text field's maxlength counts), after trimming.
export const PROFILE_LIMITS = { nameLength: 100, emailLength: 254, addressLength: 300 } as const;

/** A first or last name: 1–100 characters after trimming, on one line, no control characters. */
export const PersonName = z
  .string()
  .trim()
  .refine((s) => s.length >= 1 && s.length <= PROFILE_LIMITS.nameLength, `1 to ${PROFILE_LIMITS.nameLength} characters`)
  .refine((s) => !/\p{Cc}/u.test(s), 'no control characters');

/**
 * An e-mail address: trimmed and lower-cased before it is checked, at most 254 characters, the
 * syntax of an address. Two people may share one, so it is not unique.
 */
export const EmailAddress = z
  .string()
  .trim()
  .toLowerCase()
  .refine((s) => s.length <= PROFILE_LIMITS.emailLength, `at most ${PROFILE_LIMITS.emailLength} characters`)
  .pipe(z.email('not an e-mail address'));

/**
 * A postal address: free text of 1–300 characters after trimming, several lines allowed (a
 * carriage return before a line feed is dropped), no other control character. It is never
 * checked against a real address.
 */
export const PostalAddress = z
  .string()
  .overwrite((s) => s.replace(/\r\n?/g, '\n'))
  .trim()
  .refine((s) => s.length >= 1 && s.length <= PROFILE_LIMITS.addressLength, `1 to ${PROFILE_LIMITS.addressLength} characters`)
  .refine((s) => !/[^\P{Cc}\n]/u.test(s), 'no control characters except line feed');

const profileFields = { givenName: PersonName, familyName: PersonName, email: EmailAddress, address: PostalAddress };

/** The four facts about a person, all required, kept in Cognito's standard attributes. */
export const UserProfile = z.object(profileFields).strict();
export type UserProfile = z.infer<typeof UserProfile>;

// .strict() rejects unknown fields, e.g. an attempt to pass { "group": "admin" }.
/** POST /users: the username and the four facts. */
export const CreateUserBody = z.object({ username: Username, ...profileFields }).strict();
export type CreateUserBody = z.infer<typeof CreateUserBody>;

/** PUT /users/{username}: the four facts, all of them, which replace the stored ones. */
export const UpdateUserBody = UserProfile;
export type UpdateUserBody = UserProfile;

/**
 * The state of a User's account (docs/EMAIL_ARCHITECTURE.md section 5.3): `invited` until the
 * first sign-in has chosen a password, `active` afterwards.
 */
export const USER_STATUSES = ['invited', 'active'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * 200 of GET /me: the caller's own facts, for both roles. A fact the account does not hold yet is
 * null: the Administrator's account, made before the facts existed, has none until the
 * Administrator types them (docs/EMAIL_ARCHITECTURE.md section 4.3).
 */
export type MeResponse = { username: string; role: Role } & { [Fact in keyof UserProfile]: UserProfile[Fact] | null };
