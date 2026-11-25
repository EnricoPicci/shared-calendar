export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = { requestId: string } & Record<string, unknown>;

// Any field whose name contains one of these (case-insensitive) is replaced, at any depth.
// "token" also covers accessToken, idToken and refreshToken. The last four are a person's facts
// (docs/EMAIL_ARCHITECTURE.md section 12.4): the code never logs them, and a field named after one
// (email, givenName, familyName, address, mailAddress …) is blanked should it ever try.
const REDACT = ['password', 'authorization', 'token', 'email', 'address', 'givenname', 'familyname'];
const REDACTED = '[REDACTED]';

function clean(value: unknown): unknown {
  if (value instanceof Error) {
    // Errors serialise to {} by default; keep what helps debugging, not the stack.
    return { name: value.name, message: value.message };
  }
  if (Array.isArray(value)) {
    return value.map(clean);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => {
        const lower = key.toLowerCase();
        return [key, REDACT.some((word) => lower.includes(word)) ? REDACTED : clean(inner)];
      }),
    );
  }
  return value;
}

// One JSON line per call on stdout. Written directly rather than through console.log,
// which in Lambda prefixes each line with text and breaks the JSON.
export function log(level: LogLevel, fields: LogFields): void {
  const line = { timestamp: new Date().toISOString(), level, ...(clean(fields) as LogFields) };
  process.stdout.write(`${JSON.stringify(line)}\n`);
}
