import { BehaviorSubject, EMPTY, Observable, ReplaySubject, Subscription, of, timer } from 'rxjs';
import { catchError, map, switchMap, take, tap } from 'rxjs/operators';
import { describe, initiateAuth, toAuthOutcome, type AuthFailureReason, type AuthOutcome, type CognitoConfig } from './cognito';
import type { Session } from './login.types';
import type { RefreshFailureReason, RefreshResult, RefreshState } from './refresh.types';
import type { SessionStore } from './session.store';

// docs/FRONTEND_SERVICES.md section 11. Replaces the session in the store with a fresh access
// token, by InitiateAuth with REFRESH_TOKEN_AUTH; on demand (refresh) or on a schedule (start).

export type RefreshConfig = CognitoConfig; // the same values as LoginConfig

const REFRESH_LEAD_MS = 60_000; // refresh one minute before the access token expires

// Section 11.5. Cognito's "not authorized" is a dead refresh token here, not a wrong password.
const REASON: Record<AuthFailureReason, RefreshFailureReason> = {
  not_authorized: 'session_rejected',
  no_role: 'no_role',
  too_many_attempts: 'too_many_attempts',
  server: 'server',
  challenge: 'unexpected',
  password_reset_required: 'unexpected',
  unexpected: 'unexpected',
};

export class RefreshService {
  // Pure reactive stream: outcomes only, replayed to late subscribers.
  private readonly resultSubject = new ReplaySubject<RefreshResult>(1);
  readonly refreshResult$: Observable<RefreshResult> = this.resultSubject.asObservable();

  // State machine: idle → pending → success | failure → pending → …
  private readonly stateSubject = new BehaviorSubject<RefreshState>({ status: 'idle' });
  readonly refreshState$: Observable<RefreshState> = this.stateSubject.asObservable();

  private pending?: Subscription; // the refresh in flight, cancelled by a new one
  private schedule?: Subscription; // the automatic refresh, between start() and stop()

  constructor(
    private readonly config: RefreshConfig,
    private readonly store: SessionStore,
  ) {}

  refresh(): void {
    this.pending?.unsubscribe(); // aborts the previous fetch; its answer is discarded
    this.stateSubject.next({ status: 'pending' });

    this.pending = this.store.session$
      .pipe(
        take(1), // the refresh token of the current session, read now (section 9.5)
        switchMap((session) =>
          session
            ? initiateAuth(this.config, 'REFRESH_TOKEN_AUTH', { REFRESH_TOKEN: session.refreshToken }).pipe(
                map(({ status, text }) => this.settle(session, toAuthOutcome(status, text, session.refreshToken))),
                catchError((err: unknown) => of(failure('network', describe(err)))),
              )
            : of(failure('not_signed_in', 'Nobody is signed in')),
        ),
        tap((result) => this.stateSubject.next(result)),
      )
      // Forward `next` only: a completed or errored subject would ignore every later refresh
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.resultSubject.next(result));
  }

  // Automatic refresh: 60 s before each session's expiry, re-armed by every new session and
  // disarmed by null. One attempt per session, no retry (decision 22).
  start(): void {
    this.stop();
    this.schedule = this.store.session$
      .pipe(switchMap((s) => (s ? timer(new Date(s.expiresAt.getTime() - REFRESH_LEAD_MS)) : EMPTY)))
      .subscribe(() => this.refresh());
  }

  // Cancels the schedule, not a refresh in flight.
  stop(): void {
    this.schedule?.unsubscribe();
    this.schedule = undefined;
  }

  // Writes the store first (guarded, section 9.2), then returns the outcome for the streams,
  // without any token (rule 9).
  private settle(started: Session, outcome: AuthOutcome): RefreshResult {
    if (outcome.status === 'success') {
      this.store.replace(started, outcome.session);
      return { status: 'success', username: outcome.session.username, expiresAt: outcome.session.expiresAt };
    }
    const reason = REASON[outcome.reason];
    if (reason === 'session_rejected' || reason === 'no_role') this.store.clear(started);
    return failure(reason, outcome.message);
  }
}

function failure(reason: RefreshFailureReason, message: string): RefreshResult {
  return { status: 'failure', reason, message };
}
