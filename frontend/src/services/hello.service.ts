import type { ApiErrorCode, HelloResponse } from '@shared-calendar/shared';
import { BehaviorSubject, Observable, ReplaySubject, Subscription } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { apiCall, transportFailure, type ApiConfig, type ApiOk } from './api';
import type { HelloResult, HelloState } from './hello.types';
import type { SessionStore } from './session.store';

// docs/FRONTEND_SERVICES.md section 12. POST /hello as the signed-in user.

const HELLO_CODES = ['forbidden', 'internal_error'] as const satisfies readonly ApiErrorCode[];

export class HelloService {
  // Pure reactive stream: outcomes only, replayed to late subscribers.
  private readonly resultSubject = new ReplaySubject<HelloResult>(1);
  readonly helloResult$: Observable<HelloResult> = this.resultSubject.asObservable();

  // State machine: idle → pending → success | failure → pending → …
  private readonly stateSubject = new BehaviorSubject<HelloState>({ status: 'idle' });
  readonly helloState$: Observable<HelloState> = this.stateSubject.asObservable();

  private pending?: Subscription;

  constructor(
    private readonly config: ApiConfig,
    private readonly store: SessionStore,
  ) {}

  hello(): void {
    this.pending?.unsubscribe(); // aborts the previous fetch; its answer is discarded
    this.stateSubject.next({ status: 'pending' });

    this.pending = apiCall(this.config, this.store, { method: 'POST', path: '/hello', codes: HELLO_CODES })
      .pipe(
        // apiCall never errors: the network failure is already a value (section 10.2).
        map((answer): HelloResult => (answer.status === 'ok' ? toHelloResult(answer) : answer)),
        tap((result) => this.stateSubject.next(result)),
      )
      // Forward `next` only: a completed subject would ignore every later call (section 3.2).
      .subscribe((result) => this.resultSubject.next(result));
  }
}

// Section 12.5: the 201 must have the contract's shape, checked field by field.
function toHelloResult(answer: ApiOk): HelloResult {
  const body = (answer.body ?? {}) as Partial<Record<keyof HelloResponse, unknown>>;
  if (
    answer.httpStatus === 201 &&
    typeof body.messageId === 'string' &&
    typeof body.message === 'string' &&
    typeof body.createdAt === 'string' &&
    (body.role === 'admin' || body.role === 'user')
  ) {
    return { status: 'success', hello: body as HelloResponse };
  }
  return transportFailure('unexpected', `API answered ${answer.httpStatus} with an unexpected body`);
}
