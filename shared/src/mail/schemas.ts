import { z } from 'zod';
import { LocalDate } from '../calendar/schemas';
import { addDays } from '../calendar/time';
import { MAIL_LIMITS } from './limits';

// The bodies of the mail routes (docs/EMAIL_ARCHITECTURE.md section 9.1). Every object is
// .strict(): an unknown field is a 400.

/** PUT /mail/settings: whether the daily mail is sent, and at which whole hour, 0–23, local. */
export const MailSettingsBody = z.object({ dailyEnabled: z.boolean(), dailyHour: z.number().int().min(0).max(23) }).strict();
export type MailSettingsBody = z.infer<typeof MailSettingsBody>;

/** 200 of GET /mail/settings and of PUT /mail/settings. */
export type MailSettings = MailSettingsBody;

/**
 * POST /mail/calendar: two local dates, `from` not after `to`, at most 366 dates in all. The role
 * decides what is sent, never the body (docs/EMAIL_ARCHITECTURE.md section 9.1).
 */
export const MailCalendarBody = z
  .object({ from: LocalDate, to: LocalDate })
  .strict()
  .refine((b) => b.from <= b.to, { message: '`from` must not be after `to`', path: ['to'], when: (p) => p.issues.length === 0 })
  .refine((b) => b.to <= addDays(b.from, MAIL_LIMITS.rangeDays - 1), {
    message: `at most ${MAIL_LIMITS.rangeDays} days`,
    path: ['to'],
    when: (p) => p.issues.length === 0,
  });
export type MailCalendarBody = z.infer<typeof MailCalendarBody>;
