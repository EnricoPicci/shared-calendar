import type { Role } from '@shared-calendar/shared';
import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import type { MailService } from '../services/mail.service';
import type { MeService } from '../services/me.service';
import { failureText, MAIL_TEXTS } from './texts';

// The week's "E-mail…" dialog (docs/FRONTEND_ARCHITECTURE.md section 5.1), for both roles: asks
// for the mail of two dates, then, once it is asked for, reads the person's own address with
// GET /me, to say where the mail goes, masked (docs/EMAIL_ARCHITECTURE.md section 6.5). The
// route's answer carries no address. Shaped like a service: one public stream, `void` methods,
// nothing started by the constructor.

// What the dialog shows: `what` the mail will hold; `sending` while the request or the read of the
// address is under way; `sent` where the mail goes, once asked for; `failure` why it was not, in
// plain words.
export type MailState = { what: string; sending: boolean; sent: string | null; failure: string | null };

// What the screen uses: the request of the MailService, and the read of the MeService.
export type MailCalls = Pick<MailService, 'sendCalendar' | 'sendCalendarResult$'>;
export type MailMeCalls = Pick<MeService, 'getMe' | 'meResult$'>;

export class MailScreen {
  // What this screen waits for: the answer of the request, then the address; null when it waits
  // for nothing. An answer it does not wait for is not shown: it belongs to a dialog closed since.
  private awaited: 'mail' | 'me' | null = null;
  private readonly state: BehaviorSubject<MailState>;
  readonly mail$: Observable<MailState>;

  constructor(
    private readonly mail: MailCalls,
    private readonly me: MailMeCalls,
    private readonly role: Role,
  ) {
    this.state = new BehaviorSubject<MailState>(this.nothing());
    this.mail$ = this.state.asObservable();
  }

  // Called once the view has subscribed (docs/FRONTEND_ARCHITECTURE.md section 5, rule 5): hears
  // the answers until the subscription returned ends, which forgets everything.
  start(): Subscription {
    // A result stream hands its last result to a new subscriber at once: that one came before
    // this start and is not heard.
    let live = false;
    const subscription = this.mail.sendCalendarResult$.subscribe((result) => {
      if (!live || this.awaited !== 'mail') return;
      if (result.status === 'failure') {
        this.awaited = null;
        this.state.next({ ...this.nothing(), failure: failureText(result.reason, 'mail') });
        return;
      }
      this.awaited = 'me';
      this.me.getMe();
    });
    subscription.add(
      this.me.meResult$.subscribe((result) => {
        if (!live || this.awaited !== 'me') return;
        this.awaited = null;
        this.state.next({ ...this.nothing(), sent: MAIL_TEXTS.sent(result.status === 'success' ? result.me.email : null) });
      }),
    );
    live = true;
    subscription.add(() => this.reset());
    return subscription;
  }

  // Asks for the mail of the dates `from` to `to`, local dates as the date fields give them;
  // nothing while one is under way.
  send(from: string, to: string): void {
    if (this.awaited !== null) return;
    this.awaited = 'mail';
    this.state.next({ ...this.nothing(), sending: true });
    this.mail.sendCalendar({ from, to });
  }

  // The dialog opened again: nothing of the time before, and no answer still awaited is shown.
  reset(): void {
    this.awaited = null;
    this.state.next(this.nothing());
  }

  private nothing(): MailState {
    return { what: MAIL_TEXTS.what[this.role], sending: false, sent: null, failure: null };
  }
}
