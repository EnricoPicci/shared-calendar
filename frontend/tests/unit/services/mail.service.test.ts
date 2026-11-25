import { MailService } from '../../../src/services/mail.service';
import { json } from './fixtures';
import { CONFIG, describeMethod, type MethodSpec } from './suite';

// docs/FRONTEND_SERVICES.md section 24: POST /mail/calendar through the per-method suite, and the
// range checked with the shared rule before anything is sent.

const RANGE = { from: '2026-12-07', to: '2026-12-13' };

const sendCalendar: MethodSpec<MailService> = {
  name: 'sendCalendar',
  result$: (s) => s.sendCalendarResult$,
  state$: (s) => s.sendCalendarState$,
  call: (s) => s.sendCalendar(RANGE),
  pending: { status: 'pending', range: RANGE },
  request: { method: 'POST', path: '/mail/calendar', body: RANGE },
  ok: () => json(202, { status: 'queued' }),
  success: { status: 'success' },
  wrong: [
    ['202 with another status', () => json(202, { status: 'sent' })],
    ['202 without a body', () => new Response(null, { status: 202 })],
    ['200', () => json(200, { status: 'queued' })],
  ],
  codes: ['forbidden', 'invalid_request', 'invalid_json', 'user_not_found', 'no_email_address', 'mail_limit_reached', 'mail_unavailable', 'internal_error'],
  notCodes: ['cannot_edit_admin', 'not_invited'],
  invalid: [
    ['the second date before the first', (s) => s.sendCalendar({ from: '2026-12-13', to: '2026-12-07' }), 'to: `from` must not be after `to`'],
    ['367 days', (s) => s.sendCalendar({ from: '2026-01-01', to: '2027-01-02' }), 'to: at most 366 days'],
    ['a date that is not one', (s) => s.sendCalendar({ from: '2026-02-30', to: '2026-03-01' }), 'from: not a real date'],
  ],
};

describeMethod((store) => new MailService(CONFIG, store), sendCalendar);
