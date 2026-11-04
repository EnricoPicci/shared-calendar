import type { z } from 'zod';
import { error, type Outcome } from './http';

// The schemas (the username rule of architecture section 4) live in @shared-calendar/shared,
// where the front end uses them too; this turns a rejection into the API's 400 answer.
export function validate<T>(schema: z.ZodType<T>, value: unknown): Outcome<T> {
  const result = schema.safeParse(value);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  // Only the field paths go back to the caller, never the rejected values. An unknown field
  // is reported against its parent object, so name the field itself instead.
  const fields = result.error.issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys'
      ? issue.keys.map((key) => [...issue.path, key].join('.'))
      : [issue.path.join('.') || '(root)'],
  );
  return {
    ok: false,
    response: error(400, 'invalid_request', `Invalid input: ${[...new Set(fields)].join(', ')}`),
  };
}
