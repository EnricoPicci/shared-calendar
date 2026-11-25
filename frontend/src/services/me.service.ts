import type { ApiErrorCode, MeResponse } from '@shared-calendar/shared';
import { BehaviorSubject, Observable, ReplaySubject, Subscription } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { apiCall, unexpectedAnswer, type ApiConfig, type ApiOk } from './api';
import type { MeResult, MeState } from './me.types';
import type { SessionStore } from './session.store';

// Calls GET /me as the signed-in person, either role (docs/FRONTEND_SERVICES.md section 23): their
// own four facts, a fact not held yet null (docs/EMAIL_ARCHITECTURE.md section 4.3).

const ME_CODES = ['forbidden', 'user_not_found', 'internal_error'] as const satisfies readonly ApiErrorCode[];
const FACTS = ['givenName', 'familyName', 'email', 'address'] as const;

export class MeService {
  private readonly resultSubject = new ReplaySubject<MeResult>(1);
  readonly meResult$: Observable<MeResult> = this.resultSubject.asObservable();
  private readonly stateSubject = new BehaviorSubject<MeState>({ status: 'idle' });
  readonly meState$: Observable<MeState> = this.stateSubject.asObservable();
  private pending?: Subscription;

  constructor(
    private readonly config: ApiConfig,
    private readonly store: SessionStore,
  ) {}

  getMe(): void {
    this.pending?.unsubscribe(); // a read asked again replaces the one under way
    this.stateSubject.next({ status: 'pending' });

    this.pending = apiCall(this.config, this.store, { method: 'GET', path: '/me', codes: ME_CODES })
      .pipe(
        map((answer): MeResult => (answer.status === 'ok' ? toMeResult(answer) : answer)),
        tap((result) => this.stateSubject.next(result)),
      )
      // Forward `next` only: a completed subject would ignore every later call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.resultSubject.next(result));
  }
}

// The 200 is checked field by field: the username a string, the role one of the two, each fact a
// string or null. Only those fields are kept.
function toMeResult(answer: ApiOk): MeResult {
  const body = (answer.body ?? {}) as Partial<Record<keyof MeResponse, unknown>>;
  const factsOk = FACTS.every((fact) => typeof body[fact] === 'string' || body[fact] === null);
  if (answer.httpStatus === 200 && typeof body.username === 'string' && (body.role === 'admin' || body.role === 'user') && factsOk) {
    const me = body as MeResponse;
    return {
      status: 'success',
      me: { username: me.username, role: me.role, givenName: me.givenName, familyName: me.familyName, email: me.email, address: me.address },
    };
  }
  return unexpectedAnswer(answer);
}
