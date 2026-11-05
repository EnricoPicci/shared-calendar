import { BehaviorSubject, Observable, ReplaySubject, Subscription, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { describe, initiateAuth, toAuthOutcome, type AuthOutcome, type CognitoConfig } from './cognito';
import type { LoginFailureReason, LoginResult, LoginState } from './login.types';
import type { SessionStore } from './session.store';

// docs/FRONTEND_SERVICES.md sections 4 and 10.1. Sign-in is a direct call to Cognito's InitiateAuth
// with USER_PASSWORD_AUTH (architecture sections 3.1 and 6.2); there is no login endpoint in the API.

export type LoginConfig = CognitoConfig;

export class LoginService {
  // Pure reactive stream: outcomes only, replayed to late subscribers.
  private readonly resultSubject = new ReplaySubject<LoginResult>(1);
  readonly loginResult$: Observable<LoginResult> = this.resultSubject.asObservable();

  // State machine: idle → pending → success | failure → pending → …
  private readonly stateSubject = new BehaviorSubject<LoginState>({ status: 'idle' });
  readonly loginState$: Observable<LoginState> = this.stateSubject.asObservable();

  // The attempt in flight, so that a new attempt can cancel it.
  private pending?: Subscription;

  constructor(
    private readonly config: LoginConfig,
    private readonly store: SessionStore,
  ) {}

  // The password lives only in this argument and in the request body: never stored, never logged.
  login(username: string, password: string): void {
    this.pending?.unsubscribe(); // aborts the previous fetch; its answer is discarded
    this.stateSubject.next({ status: 'pending', username });

    this.pending = initiateAuth(this.config, 'USER_PASSWORD_AUTH', { USERNAME: username, PASSWORD: password })
      .pipe(
        map(({ status, text }) => this.settle(toAuthOutcome(status, text))),
        catchError((err: unknown) => of(failure('network', describe(err)))),
        tap((result) => this.stateSubject.next(result)),
      )
      // Forward `next` only, never `subscribe(this.resultSubject)`: the HTTP observable completes
      // after one value, and a completed (or errored) subject ignores every later `next`, so the
      // second login would reach no one (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.resultSubject.next(result));
  }

  // Writes the session to the store first (section 9.4), then returns the outcome for the
  // streams, without any token (rule 9).
  private settle(outcome: AuthOutcome): LoginResult {
    if (outcome.status === 'success') {
      const { username, role, expiresAt } = outcome.session;
      this.store.set(outcome.session);
      return { status: 'success', username, role, expiresAt };
    }
    // For a login, Cognito's "not authorized" is a wrong username or password.
    if (outcome.reason === 'not_authorized') return failure('invalid_credentials', outcome.message);
    return failure(outcome.reason, outcome.message); // every other reason is also a LoginFailureReason
  }
}

function failure(reason: LoginFailureReason, message: string): LoginResult {
  return { status: 'failure', reason, message };
}
