import { z } from 'zod';

// Architecture section 4: 3 to 32 characters, lowercase, starting with a letter or digit.
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const Username = z.string().regex(USERNAME_PATTERN, 'invalid username');

// .strict() rejects unknown fields, e.g. an attempt to pass { "group": "admin" }.
export const CreateUserBody = z.object({ username: Username }).strict();
export type CreateUserBody = z.infer<typeof CreateUserBody>;

// An object rather than the bare string, so that a rejection names the field
// ("Invalid input: username") instead of "(root)".
export const UsernameParam = z.object({ username: Username });
export type UsernameParam = z.infer<typeof UsernameParam>;
