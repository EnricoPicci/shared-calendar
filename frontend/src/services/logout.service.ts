import { BehaviorSubject, Observable, ReplaySubject, of } from 'rxjs';
import { catchError, map, switchMap, take, tap, timeout } from 'rxjs/operators';
import { describe, revokeToken, toRevokeOutcome, type CognitoConfig } from './cognito';
import type { LogoutFailureReason, LogoutResult, LogoutState } from './logout.types';
import type { SessionStore } from './session.store';

// Signs out (docs/FRONTEND_SERVICES.md section 20): the page forgets the person at once, and
// then Cognito is told to revoke the refresh token (RevokeToken), so that a copy of it can make
// no new access token. The first cannot fail; the result says how the second went.

export type LogoutConfig = CognitoConfig; // the same values as LoginConfig

// A service that lives as long as the page and can be put back to its first state: the
// LoginService and the RefreshService, whose last outcome names the person who was signed in.
export type Resettable = { reset(): void };

const REVOKE_TIMEOUT_MS = 10_000; // how long Cognito's answer is waited for

export class LogoutService {
  // Pure reactive stream: one outcome per revocation, in the order they arrive, replayed to
  // late subscribers.
  private readonly resultSubject = new ReplaySubject<LogoutResult>(1);
  readonly logoutResult$: Observable<LogoutResult> = this.resultSubject.asObservable();

  // State machine of the latest call: idle → pending → success | failure → pending → …
  private readonly stateSubject = new BehaviorSubject<LogoutState>({ status: 'idle' });
  readonly logoutState$: Observable<LogoutState> = this.stateSubject.asObservable();

  // Counts the calls, so that the state follows the latest one only.
  private calls = 0;

  constructor(
    private readonly config: LogoutConfig,
    private readonly store: SessionStore,
    private readonly pageWide: readonly Resettable[],
  ) {}

  // Everything up to the sending of the request happens before this returns: the store gives
  // its session at once. No call is ever cancelled, by a later call or by anything else: each
  // ends by itself, at the answer or at the time limit (docs/FRONTEND_SERVICES.md section 8,
  // decisions 48 and 51).
  logout(): void {
    const call = ++this.calls;
    this.stateSubject.next({ status: 'pending' });

    this.store.session$
      .pipe(
        take(1), // whoever is signed in at the press
        // Forget first (docs/FRONTEND_SERVICES.md section 8, decision 47). The page-wide services
        // before the store: whoever reacts to the store's null then finds them in their first
        // state.
        tap(() => {
          this.pageWide.forEach((service) => service.reset());
          this.store.clear();
        }),
        // Then tell Cognito, with the refresh token read above. It is the one copy left, held by
        // this call's parameters and by the request's body, in no field; it goes when the
        // request ends (docs/FRONTEND_SERVICES.md section 2, rule 9, the exception).
        switchMap((session) => (session ? this.revoke(session.refreshToken) : of(failure('not_signed_in', 'Nobody was signed in')))),
      )
      .subscribe((result) => {
        // A late outcome of an earlier call does not overwrite the state of a later one.
        if (call === this.calls) this.stateSubject.next(result);
        // Forward `next` only: a completed or errored subject would ignore every later sign-out
        // (docs/FRONTEND_SERVICES.md section 3.2).
        this.resultSubject.next(result);
      });
  }

  // One revocation: answered, refused, unreachable, or given up at the time limit, which also
  // aborts the request. Nothing is written to the store: it was cleared before the request left.
  private revoke(refreshToken: string): Observable<LogoutResult> {
    return revokeToken(this.config, refreshToken).pipe(
      map(({ status, text }): LogoutResult => toRevokeOutcome(status, text)),
      timeout({
        first: REVOKE_TIMEOUT_MS,
        with: () => of(failure('timeout', `Cognito did not answer within ${REVOKE_TIMEOUT_MS / 1000} seconds`)),
      }),
      catchError((err: unknown) => of(failure('network', describe(err)))),
    );
  }
}

function failure(reason: LogoutFailureReason, message: string): LogoutResult {
  return { status: 'failure', reason, message };
}
