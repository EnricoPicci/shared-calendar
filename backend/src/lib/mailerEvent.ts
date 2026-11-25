import { MailCalendarBody, Username } from '@shared-calendar/shared';
import { z } from 'zod';

// What the mailer is started with (docs/EMAIL_ARCHITECTURE.md section 6.1): the kind, the person
// who asked (their `sub`, username and role), the range of local dates, and the id of the request
// that started it, for the log line. Never an address: the mailer reads the person's address in
// Cognito itself, so a mail goes only to the account's own address (docs/EMAIL_ARCHITECTURE.md
// decision M10). The kind follows the role: `calendar`, the whole calendar, for the Administrator;
// `mine`, their own appointments, for a User. The range obeys the rules of the route's body: `from`
// not after `to`, at most 366 dates.
export const MailerEvent = z
  .object({
    kind: z.enum(['calendar', 'mine']),
    sub: z.string().min(1),
    username: Username,
    role: z.enum(['admin', 'user']),
    from: z.string(),
    to: z.string(),
    requestId: z.string().min(1),
  })
  .strict()
  .refine((e) => (e.kind === 'calendar') === (e.role === 'admin'), { message: 'the kind does not follow the role', path: ['kind'] })
  .refine((e) => MailCalendarBody.safeParse({ from: e.from, to: e.to }).success, { message: 'not a valid range', path: ['to'] });
export type MailerEvent = z.infer<typeof MailerEvent>;

/** The kind of mail a role gets on demand: the role decides, never the request (docs/EMAIL_ARCHITECTURE.md section 9.1). */
export function kindFor(role: MailerEvent['role']): MailerEvent['kind'] {
  return role === 'admin' ? 'calendar' : 'mine';
}
