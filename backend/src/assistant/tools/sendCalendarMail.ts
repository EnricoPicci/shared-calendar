import { MailCalendarBody, maskAddress, type MailSummary, type MeResponse } from '@shared-calendar/shared';
import { handler as getMe } from '../../handlers/getMe';
import { refusalOf, succeeded } from './run';
import type { ChangeTool, Tool, ToolDefinition } from './tool';

// The tool for POST /mail/calendar (docs/EMAIL_ARCHITECTURE.md section 7): a mail with the
// appointments of a range of dates, sent to the e-mail address of the person's own account, by the
// Administrator or a User. A mail changes nothing in the calendar, but it is an act with an effect
// outside the application, so it is a change like the others: asked for by Claude it is never
// sent, it becomes a proposal the person confirms (docs/CONVERSATIONAL_ARCHITECTURE.md section
// 5.5). This file reads the person's own details through the handler of GET /me; the handler of
// the mail route is not imported here.

// The two local dates, checked by the route's own schema: `from` not after `to`, at most
// MAIL_LIMITS.rangeDays dates. No address: a mail only ever goes to the account's own.
const Input = MailCalendarBody;
type Input = MailCalendarBody;

export const sendCalendarMailDefinition: ToolDefinition = {
  name: 'send_calendar_mail',
  description:
    "E-mails the appointments of a range of local dates, \"from\" and \"to\" both included, at most 366 days, to the e-mail address of the person's own account and to no other. " +
    'For a User the mail lists their own appointments in its text and holds them in an Excel file; for the Administrator it holds every appointment of the calendar in the range, in an Excel file. ' +
    'Calling this tool sends nothing by itself: the application shows the person the dates and their masked address, with a button to confirm and a button to decline, and sends only when the person presses the confirm button. ' +
    'Ask for one mail per answer. When the person asks for several periods at once ("this week and next week", "the first week of December and the first week of January"), call this tool once, from the first day of the earliest period to the last day of the latest: the appointments between them are in the mail too. ' +
    'A person may ask for 5 mails a day; the application refuses more when the person confirms.',
  kind: 'change',
  roles: ['admin', 'user'],
  input: () => Input,
  reads: 'details',
};

// What a mail's proposal says when e-mail is not switched on in this stack, the route's own code
// (docs/EMAIL_ARCHITECTURE.md section 13.2).
const UNAVAILABLE = { ok: false as const, error: 'mail_unavailable', message: 'E-mail is not available yet in this calendar: no mail can be sent. Tell the person.' };

// What it says when the person's account has no e-mail address (docs/EMAIL_ARCHITECTURE.md section
// 4.2): a User asks the Administrator to add one; the Administrator adds their own in the Users page.
const NO_ADDRESS = {
  ok: false as const,
  error: 'no_email_address',
  message: "The person's account has no e-mail address, so no mail can be sent. A User asks the Administrator to add one; the Administrator adds it in the Users page of the web pages.",
};

const parts: ChangeTool<Input, MailSummary> = {
  definition: sendCalendarMailDefinition,
  confirmation: {
    // In this order: the stage, then the person's own details, then the request the route will be
    // sent. Nothing is proposed when e-mail is off or the account has no address, so the person
    // is told before any button. The day's count of five is not looked at: the route counts at the
    // confirmation (docs/EMAIL_ARCHITECTURE.md section 7).
    read: async ({ from, to }, context, route) => {
      if (process.env.MAIL_STAGE !== 'on') return UNAVAILABLE;
      const me = await route(getMe, { routeKey: 'GET /me', path: '/me' });
      if (!succeeded(me)) return { ok: false, ...refusalOf(me, "The person's details could not be read.") };
      const { email } = me.body as MeResponse;
      if (email === null) return NO_ADDRESS;
      return {
        ok: true,
        call: { routeKey: 'POST /mail/calendar', path: '/mail/calendar', body: { from, to } },
        // One mail per answer of Claude: a second mail in the same answer is not proposed.
        subjects: ['mail'],
        facts: { from, to, kind: context.role === 'admin' ? 'calendar' : 'mine', address: maskAddress(email) },
      };
    },
    summary: (texts, facts) => texts.changes.sendCalendarMail(facts),
  },
  // The route answers only that the mailer was started. Claude gets that the mail is on its way,
  // and never the address, masked or not. The message takes the place of the one every change
  // made gets, which speaks of what the calendar now holds: a mail changes nothing in it.
  toModel: () => ({
    fields: { message: "The person pressed the confirm button and the mail was asked for: it is on its way to the e-mail address of the person's account, and may take a few minutes to arrive." },
  }),
};
export const sendCalendarMail = parts as Tool;
