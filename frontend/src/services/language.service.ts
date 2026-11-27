import { readLanguage, type Language } from '@shared-calendar/shared';
import { BehaviorSubject, Observable, ReplaySubject, Subscription, of } from 'rxjs';
import { catchError, map, switchMap, take, tap } from 'rxjs/operators';
import { cognitoRequest, describe, readCognitoBody, readCognitoError, type CognitoConfig } from './cognito';
import type { LanguageFailureReason, LanguageReadResult, LanguageWriteResult, LanguageWriteState } from './language.types';
import type { Session } from './login.types';
import type { SessionStore } from './session.store';

// The person's own language, stored in their account as the attribute `locale`
// (docs/MULTILANGUAGE_PLAN.md finding F11): read with Cognito's GetUser and written with
// UpdateUserAttributes, straight at Cognito with the access token read from the store, as the
// change of password is. No route of the API is involved, and no username is given: Cognito reads
// and writes the token's owner and nobody else. The id token does not carry `locale`
// (docs/MULTILANGUAGE_PLAN.md finding F8), hence the read.

// The attribute that holds the language.
export const LANGUAGE_ATTRIBUTE = 'locale';

const REASON_BY_TYPE: Record<string, LanguageFailureReason> = {
  NotAuthorizedException: 'session_rejected',
  LimitExceededException: 'too_many_attempts',
  TooManyRequestsException: 'too_many_attempts',
};

export class LanguageService {
  // Pure reactive streams: outcomes only, the last replayed to a late subscriber.
  private readonly readSubject = new ReplaySubject<LanguageReadResult>(1);
  readonly readResult$: Observable<LanguageReadResult> = this.readSubject.asObservable();
  private readonly writeSubject = new ReplaySubject<LanguageWriteResult>(1);
  readonly writeResult$: Observable<LanguageWriteResult> = this.writeSubject.asObservable();

  // The write's state machine: idle → pending → success | failure → pending → …
  private readonly writeStateSubject = new BehaviorSubject<LanguageWriteState>({ status: 'idle' });
  readonly writeState$: Observable<LanguageWriteState> = this.writeStateSubject.asObservable();

  // The calls in flight, so that a new call of the same kind abandons the earlier one.
  private reading?: Subscription;
  private writing?: Subscription;

  constructor(
    private readonly config: Pick<CognitoConfig, 'cognitoUrl'>,
    private readonly store: SessionStore,
  ) {}

  /** Reads the signed-in person's language. */
  read(): void {
    this.reading?.unsubscribe();
    this.reading = this.withSession((session) =>
      cognitoRequest(this.config, 'GetUser', { AccessToken: session.accessToken }).pipe(map(({ status, text }) => toReadResult(status, text))),
    ).subscribe((result) => this.readSubject.next(result));
  }

  /** Stores `language` as the signed-in person's language. */
  write(language: Language): void {
    this.writing?.unsubscribe();
    this.writeStateSubject.next({ status: 'pending', language });
    this.writing = this.withSession((session) =>
      cognitoRequest(this.config, 'UpdateUserAttributes', {
        AccessToken: session.accessToken,
        UserAttributes: [{ Name: LANGUAGE_ATTRIBUTE, Value: language }],
      }).pipe(map(({ status, text }): LanguageWriteResult => (status === 200 ? { status: 'success', language } : toFailure(status, text)))),
    )
      .pipe(tap((result) => this.writeStateSubject.next(result)))
      .subscribe((result) => this.writeSubject.next(result));
  }

  // One request with the access token of the current session, read at the moment of the call; a
  // network failure is a result, and so is nobody signed in, with no request.
  private withSession<T extends LanguageReadResult | LanguageWriteResult>(request: (session: Session) => Observable<T>): Observable<T | LanguageReadResult & { status: 'failure' }> {
    return this.store.session$.pipe(
      take(1),
      switchMap((session) => (session ? request(session).pipe(catchError((err: unknown) => of(failure('network', describe(err))))) : of(failure('not_signed_in', 'Nobody is signed in')))),
    );
  }
}

// GetUser answers 200 with the account's attributes as a list of names and values; only `locale`
// is read from it, and only a language of the calendar is kept.
function toReadResult(status: number, text: string): LanguageReadResult {
  if (status !== 200) return toFailure(status, text);
  const body = readCognitoBody(text);
  if (body === undefined) return failure('server', `Cognito answered ${status} without JSON`);
  const attributes = Array.isArray(body.UserAttributes) ? (body.UserAttributes as { Name?: unknown; Value?: unknown }[]) : [];
  const stored = attributes.find((attribute) => attribute?.Name === LANGUAGE_ATTRIBUTE)?.Value;
  return { status: 'success', language: readLanguage(stored) };
}

// A refusal is a 4xx or 5xx whose body names the error class, as for the other targets.
function toFailure(status: number, text: string): { status: 'failure'; reason: LanguageFailureReason; message: string } {
  const body = readCognitoBody(text);
  if (body === undefined) return failure('server', `Cognito answered ${status} without JSON`);
  const { type, message } = readCognitoError(body);
  return failure(REASON_BY_TYPE[type] ?? (status >= 500 ? 'server' : 'unexpected'), message ?? `Cognito answered ${status}`);
}

function failure(reason: LanguageFailureReason, message: string): { status: 'failure'; reason: LanguageFailureReason; message: string } {
  return { status: 'failure', reason, message };
}
