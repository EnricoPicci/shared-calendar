import { z } from 'zod';
import { error, type Outcome } from './http';

// Architecture section 4: 3 to 32 characters, lowercase, starting with a letter or digit.
const USERNAME = z.string().regex(/^[a-z0-9][a-z0-9._-]{2,31}$/, 'invalid username');

// .strict() rejects unknown fields, e.g. an attempt to pass { "group": "admin" }.
export const CreateUserBody = z.object({ username: USERNAME }).strict();
export type CreateUserBody = z.infer<typeof CreateUserBody>;

export const UsernameParam = USERNAME;

export function validate<T>(schema: z.ZodType<T>, value: unknown): Outcome<T> {
  const result = schema.safeParse(value);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  // Only the field paths go back to the caller, never the rejected values.
  const fields = result.error.issues.map((issue) => issue.path.join('.') || '(root)');
  return {
    ok: false,
    response: error(400, 'invalid_request', `Invalid input: ${[...new Set(fields)].join(', ')}`),
  };
}
