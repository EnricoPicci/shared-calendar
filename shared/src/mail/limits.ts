// The limits of e-mail (docs/EMAIL_ARCHITECTURE.md decision M16, section 6.5): they protect the
// sender's reputation at SES and the cost, and are enough for any real use.
export const MAIL_LIMITS = {
  // The mails on demand one person may ask for in one local day of the calendar's time zone; the
  // daily mail does not count.
  mailsPerDay: 5,
  // The local dates one request for a mail may cover, both ends included.
  rangeDays: 366,
} as const;

// The daily mail's settings until the Administrator first saves them (docs/EMAIL_ARCHITECTURE.md
// section 9.1): switched on, at 07:00 in the calendar's time zone.
export const DEFAULT_MAIL_SETTINGS = { dailyEnabled: true, dailyHour: 7 } as const;
