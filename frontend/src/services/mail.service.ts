import { MailCalendarBody, type ApiErrorCode } from '@shared-calendar/shared';
import { BehaviorSubject, Observable, ReplaySubject, Subscription, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { apiCall, invalidRequest, unexpectedAnswer, type ApiConfig, type ApiOk } from './api';
import type { SendCalendarResult, SendCalendarState } from './mail.types';
import type { SessionStore } from './session.store';

// Asks for the mail of a range of dates with POST /mail/calendar, as the signed-in person, either
// role (docs/FRONTEND_SERVICES.md section 24). What the mail holds is the role's: the whole
// calendar for the Administrator, their own appointments for a User; it goes to the person's own
// address, which the request does not carry (docs/EMAIL_ARCHITECTURE.md section 9.1).

const SEND_CODES = [
  'forbidden',
  'invalid_request',
  'invalid_json',
  'user_not_found',
  'no_email_address',
  'mail_limit_reached',
  'mail_unavailable',
  'internal_error',
] as const satisfies readonly ApiErrorCode[];

export class MailService {
  private readonly sendResultSubject = new ReplaySubject<SendCalendarResult>(1);
  readonly sendCalendarResult$: Observable<SendCalendarResult> = this.sendResultSubject.asObservable();
  private readonly sendStateSubject = new BehaviorSubject<SendCalendarState>({ status: 'idle' });
  readonly sendCalendarState$: Observable<SendCalendarState> = this.sendStateSubject.asObservable();
  private pending?: Subscription;

  constructor(
    private readonly config: ApiConfig,
    private readonly store: SessionStore,
  ) {}

  // The range is checked with the shared rule before anything is sent: two dates, `from` not
  // after `to`, at most 366 days (docs/EMAIL_ARCHITECTURE.md section 6.5).
  sendCalendar(range: MailCalendarBody): void {
    this.pending?.unsubscribe(); // a request asked again replaces the one under way
    this.sendStateSubject.next({ status: 'pending', range });

    const checked = MailCalendarBody.safeParse(range);
    const call: Observable<SendCalendarResult> = !checked.success
      ? of(invalidRequest(checked.error)) // no request sent
      : apiCall(this.config, this.store, { method: 'POST', path: '/mail/calendar', body: checked.data, codes: SEND_CODES }).pipe(
          map((answer): SendCalendarResult => (answer.status === 'ok' ? toSendResult(answer) : answer)),
        );

    this.pending = call
      .pipe(tap((result) => this.sendStateSubject.next(result)))
      // Forward `next` only: a completed subject would ignore every later call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.sendResultSubject.next(result));
  }
}

// The contract's answer is 202 with `{ status: "queued" }`; anything else is unexpected.
function toSendResult(answer: ApiOk): SendCalendarResult {
  const body = answer.body as { status?: unknown } | undefined;
  return answer.httpStatus === 202 && body?.status === 'queued' ? { status: 'success' } : unexpectedAnswer(answer);
}
