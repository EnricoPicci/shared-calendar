import { passwordProblems } from '@shared-calendar/shared';
import { BehaviorSubject, Observable, ReplaySubject, Subscription, of } from 'rxjs';
import { catchError, map, switchMap, take, tap } from 'rxjs/operators';
import type {
  ChangePasswordConfig,
  ChangePasswordFailureReason,
  ChangePasswordResult,
  ChangePasswordState,
  NewPasswordProblem,
} from './change-password.types';
import { cognitoRequest, describe, readCognitoBody, readCognitoError } from './cognito';
import type { Session } from './login.types';
import type { SessionStore } from './session.store';

// The signed-in person changes their own password (docs/ARCHITECTURE.md section 6.9,
// docs/FRONTEND_SERVICES.md section 22): Cognito's ChangePassword with the access token read from
// the store, then GlobalSignOut, then the store cleared. No route of the API is involved, and no
// username is given: Cognito changes the password of the token's owner and nobody else's.

// How Cognito's refusals of a change read (docs/ARCHITECTURE.md section 6.9, row 2). The new
// password was checked against the pool's rule before the request, so InvalidPasswordException
// is read as a wrong current password: it is what the local emulator answers to one.
const REASON_BY_TYPE: Record<string, 'wrong_current_password' | 'too_many_attempts'> = {
  NotAuthorizedException: 'wrong_current_password',
  InvalidPasswordException: 'wrong_current_password',
  LimitExceededException: 'too_many_attempts',
  TooManyRequestsException: 'too_many_attempts',
};

export class ChangePasswordService {
  // Pure reactive stream: outcomes only, replayed to late subscribers.
  private readonly resultSubject = new ReplaySubject<ChangePasswordResult>(1);
  readonly changePasswordResult$: Observable<ChangePasswordResult> = this.resultSubject.asObservable();

  // State machine: idle → pending → success | failure → pending → …
  private readonly stateSubject = new BehaviorSubject<ChangePasswordState>({ status: 'idle' });
  readonly changePasswordState$: Observable<ChangePasswordState> = this.stateSubject.asObservable();

  // The change in flight, so that a new call can abandon it.
  private pending?: Subscription;

  constructor(
    private readonly config: ChangePasswordConfig,
    private readonly store: SessionStore,
  ) {}

  // Both passwords live only in these arguments and in the request body: never stored, never put
  // in a stream, a state or a message (docs/FRONTEND_SERVICES.md section 2, rule 6).
  changePassword(current: string, next: string): void {
    this.pending?.unsubscribe(); // aborts the previous request; its answer is discarded
    this.stateSubject.next({ status: 'pending' });

    const problems = newPasswordProblems(current, next);
    const call: Observable<ChangePasswordResult> =
      problems.length > 0
        ? of(refused(problems)) // no request sent: Cognito is never asked to refuse a new password
        : this.store.session$.pipe(
            take(1), // the access token of the current session, read at the moment of the call
            switchMap((session) => (session ? this.change(session, current, next) : of(failure('not_signed_in', 'Nobody is signed in')))),
          );

    this.pending = call
      .pipe(tap((result) => this.stateSubject.next(result)))
      // Forward `next` only: a completed or errored subject would ignore every later call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.resultSubject.next(result));
  }

  // ChangePassword, and after a change the end of every session of the person.
  private change(session: Session, current: string, next: string): Observable<ChangePasswordResult> {
    return cognitoRequest(this.config, 'ChangePassword', {
      AccessToken: session.accessToken,
      PreviousPassword: current,
      ProposedPassword: next,
    }).pipe(
      map(({ status, text }) => toChangeAnswer(status, text)),
      catchError((err: unknown) => of(failure('network', describe(err)))),
      switchMap((answer) => (answer === 'changed' ? this.signOutEverywhere(session) : of(answer))),
    );
  }

  // GlobalSignOut revokes every refresh token of the person, so their other devices are signed out
  // at their next refresh (docs/ARCHITECTURE.md section 6.9, row 3). Skipped when the configuration
  // says so. Whatever it answers, even a failure or no answer at all, the change is made: the store
  // is cleared and the outcome is the one success (docs/FRONTEND_SERVICES.md section 8, decision 65).
  // The store is cleared whatever session it holds by then: a refresh during the change replaces
  // the session object, and the person must sign in again with the new password in every case.
  private signOutEverywhere(session: Session): Observable<ChangePasswordResult> {
    const signOut: Observable<unknown> = this.config.skipGlobalSignOut
      ? of(undefined)
      : cognitoRequest(this.config, 'GlobalSignOut', { AccessToken: session.accessToken }).pipe(catchError(() => of(undefined)));
    return signOut.pipe(
      map((): ChangePasswordResult => {
        this.store.clear();
        return { status: 'success' };
      }),
    );
  }
}

// What a new password misses: the shared rule's conditions, then being the current one again.
function newPasswordProblems(current: string, next: string): NewPasswordProblem[] {
  const problems: NewPasswordProblem[] = passwordProblems(next);
  if (next === current) problems.push('same_as_current');
  return problems;
}

// ChangePassword answers 200 with an empty body when the password is changed; a refusal is a 400
// whose body names the error class, as for InitiateAuth (docs/FRONTEND_SERVICES.md section 4.1).
function toChangeAnswer(status: number, text: string): 'changed' | ChangePasswordResult {
  if (status === 200) return 'changed';
  const body = readCognitoBody(text);
  if (body === undefined) return failure('server', `Cognito answered ${status} without JSON`);
  const { type, message } = readCognitoError(body);
  const reason = REASON_BY_TYPE[type] ?? (status >= 500 ? 'server' : 'unexpected');
  return failure(reason, message ?? `Cognito answered ${status}`);
}

function refused(problems: NewPasswordProblem[]): ChangePasswordResult {
  return { status: 'failure', reason: 'new_password_refused', message: `The new password is refused: ${problems.join(', ')}`, problems };
}

function failure(reason: Exclude<ChangePasswordFailureReason, 'new_password_refused'>, message: string): ChangePasswordResult {
  return { status: 'failure', reason, message };
}
