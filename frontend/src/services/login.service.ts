import { passwordProblems } from '@shared-calendar/shared';
import { BehaviorSubject, Observable, ReplaySubject, Subscription, of } from 'rxjs';
import { catchError, filter, map, tap } from 'rxjs/operators';
import {
  describe,
  initiateAuth,
  respondToNewPassword,
  toChallengeOutcome,
  toSignInOutcome,
  type AuthOutcome,
  type ChallengeOutcome,
  type CognitoConfig,
  type SignInOutcome,
} from './cognito';
import type { LoginFailureReason, LoginResult, LoginState, NewPasswordRefusal } from './login.types';
import type { SessionStore } from './session.store';

// Signs in (docs/FRONTEND_SERVICES.md sections 4 and 10.1) by a direct call to Cognito's
// InitiateAuth with USER_PASSWORD_AUTH, as in docs/ARCHITECTURE.md sections 3.1 and 6.2; there is
// no login endpoint in the API. An account whose password is temporary gets the challenge
// NEW_PASSWORD_REQUIRED instead of tokens; the service then waits for a new password, answers the
// challenge, and signs the person in as a sign-in does (docs/FRONTEND_SERVICES.md section 4.9).

export type LoginConfig = CognitoConfig;

export class LoginService {
  // Pure reactive stream: outcomes only, replayed to late subscribers. The buffer of one cannot
  // be emptied, so reset() overwrites it: `undefined` takes the place of the last outcome and
  // is never passed on.
  private readonly resultSubject = new ReplaySubject<LoginResult | undefined>(1);
  readonly loginResult$: Observable<LoginResult> = this.resultSubject.pipe(
    filter((result): result is LoginResult => result !== undefined),
  );

  // State machine: idle → pending → success | failure | new_password_required → pending → …;
  // new_password_required → answering → success | failure | new_password_required (refused).
  private readonly stateSubject = new BehaviorSubject<LoginState>({ status: 'idle' });
  readonly loginState$: Observable<LoginState> = this.stateSubject.asObservable();

  // The attempt in flight, so that a new attempt can cancel it.
  private pending?: Subscription;

  // The open challenge NEW_PASSWORD_REQUIRED: the username and Cognito's session for it. The
  // session is a secret for its 3 minutes, so it stays here, like a password in an argument: never
  // in a state, a result or a log. The service keeps no clock: Cognito says when it is over.
  private challenge?: { username: string; session: string };

  constructor(
    private readonly config: LoginConfig,
    private readonly store: SessionStore,
  ) {}

  // The password lives only in this argument and in the request body: never stored, never logged.
  login(username: string, password: string): void {
    this.pending?.unsubscribe(); // aborts the previous fetch; its answer is discarded
    this.challenge = undefined; // a new sign-in forgets an open challenge
    this.stateSubject.next({ status: 'pending', username });

    this.pending = initiateAuth(this.config, 'USER_PASSWORD_AUTH', { USERNAME: username, PASSWORD: password })
      .pipe(
        map(({ status, text }) => this.signedIn(username, toSignInOutcome(status, text))),
        catchError((err: unknown) => of(failure('network', describe(err)))),
        tap((result) => this.stateSubject.next(result)),
      )
      // Forward `next` only, never `subscribe(this.resultSubject)`: the HTTP observable completes
      // after one value, and a completed (or errored) subject ignores every later `next`, so the
      // second login would reach no one (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.resultSubject.next(result));
  }

  // The new password for the open challenge, checked with the shared rule before it is sent: a
  // password the rule refuses is never sent, and the challenge stays open. Accepted, the person is
  // signed in exactly as by login(); a session Cognito no longer takes is the failure
  // `session_expired`, and the challenge is forgotten. Without an open challenge nothing happens.
  // The password lives only in this argument and in the request body.
  choosePassword(newPassword: string): void {
    const challenge = this.challenge;
    if (challenge === undefined) return;
    this.pending?.unsubscribe(); // aborts a previous answer; its outcome is discarded
    const { username } = challenge;
    this.stateSubject.next({ status: 'answering', username });

    const problems = passwordProblems(newPassword);
    const answer: Observable<LoginResult> =
      problems.length > 0
        ? of(stillRequired(username, { reason: 'new_password_refused', problems }))
        : respondToNewPassword(this.config, username, newPassword, challenge.session).pipe(
            map(({ status, text }) => this.answered(username, toChallengeOutcome(status, text))),
            catchError((err: unknown) => of(stillRequired(username, { reason: 'network', message: describe(err) }))),
          );
    this.pending = answer.pipe(tap((result) => this.stateSubject.next(result))).subscribe((result) => this.resultSubject.next(result));
  }

  // Back to the first state, as when the service was created: no attempt in flight, no open
  // challenge, `idle`, and no outcome to replay. "Cancel" on the screen that asks for a new
  // password calls it too: nothing is changed at Cognito, and the temporary password still signs
  // in the next time. The service lives as long as the page and its last outcome names a
  // person, so a sign-out calls this (docs/FRONTEND_SERVICES.md section 4.4 and section 8,
  // decision 53). The store is not touched.
  reset(): void {
    this.pending?.unsubscribe(); // an attempt in flight is aborted and never reports
    this.pending = undefined;
    this.challenge = undefined;
    this.resultSubject.next(undefined);
    this.stateSubject.next({ status: 'idle' });
  }

  // The sign-in's answer: the challenge of a temporary password is kept, with its session, and
  // only the username goes on; anything else is settled as usual.
  private signedIn(username: string, outcome: SignInOutcome): LoginResult {
    if (outcome.status !== 'new_password_required') return this.settle(outcome);
    this.challenge = { username, session: outcome.session };
    return { status: 'new_password_required', username };
  }

  // The answer to the challenge: tokens settle as a sign-in's and close the challenge; a session
  // Cognito no longer takes closes it too; any other refusal leaves it open.
  private answered(username: string, outcome: ChallengeOutcome): LoginResult {
    if (outcome.status === 'refused') return stillRequired(username, { reason: outcome.reason, message: outcome.message });
    this.challenge = undefined;
    if (outcome.status === 'expired') return failure('session_expired', outcome.message);
    return this.settle(outcome);
  }

  // Writes the session to the store first (docs/FRONTEND_SERVICES.md section 9.4), then returns the
  // outcome for the streams, without any token (docs/FRONTEND_SERVICES.md section 2, rule 9).
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

function stillRequired(username: string, refusal: NewPasswordRefusal): LoginResult {
  return { status: 'new_password_required', username, refusal };
}

function failure(reason: LoginFailureReason, message: string): LoginResult {
  return { status: 'failure', reason, message };
}
