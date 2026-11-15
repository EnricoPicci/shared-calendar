import { Username, type ApiErrorCode, type UserSummary } from '@shared-calendar/shared';
import { BehaviorSubject, Observable, ReplaySubject, Subscription, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { apiCall, apiFailure, hasString, transportFailure, unexpectedAnswer, type ApiConfig, type ApiOk } from './api';
import type { SessionStore } from './session.store';
import type {
  CreateUserResult,
  CreateUserState,
  DeleteUserResult,
  DeleteUserState,
  ListUsersResult,
  ListUsersState,
} from './users.types';

// The administrator's three calls (docs/FRONTEND_SERVICES.md section 13): POST /users,
// DELETE /users/{username} and GET /users, three pairs of streams, independent of each other.

const CREATE_CODES = ['forbidden', 'invalid_json', 'invalid_request', 'user_exists', 'internal_error'] as const satisfies readonly ApiErrorCode[];
// concurrent_update: the deletion cancels the User's appointments under the calendar lock, which can
// be busy (docs/FRONTEND_SERVICES.md section 8, decision 37).
const DELETE_CODES = [
  'forbidden',
  'invalid_request',
  'cannot_delete_admin',
  'user_not_found',
  'concurrent_update',
  'internal_error',
] as const satisfies readonly ApiErrorCode[];
const LIST_CODES = ['forbidden', 'internal_error'] as const satisfies readonly ApiErrorCode[];
const INVALID_USERNAME =
  'A username has 3 to 32 characters: lowercase letters, digits, ".", "_" or "-", starting with a letter or a digit';

export class UsersService {
  // Pair 1: create.
  private readonly createResultSubject = new ReplaySubject<CreateUserResult>(1);
  readonly createUserResult$: Observable<CreateUserResult> = this.createResultSubject.asObservable();
  private readonly createStateSubject = new BehaviorSubject<CreateUserState>({ status: 'idle' });
  readonly createUserState$: Observable<CreateUserState> = this.createStateSubject.asObservable();
  private pendingCreate?: Subscription;

  // Pair 2: delete.
  private readonly deleteResultSubject = new ReplaySubject<DeleteUserResult>(1);
  readonly deleteUserResult$: Observable<DeleteUserResult> = this.deleteResultSubject.asObservable();
  private readonly deleteStateSubject = new BehaviorSubject<DeleteUserState>({ status: 'idle' });
  readonly deleteUserState$: Observable<DeleteUserState> = this.deleteStateSubject.asObservable();
  private pendingDelete?: Subscription;

  // Pair 3: list.
  private readonly listUsersResultSubject = new ReplaySubject<ListUsersResult>(1);
  readonly listUsersResult$: Observable<ListUsersResult> = this.listUsersResultSubject.asObservable();
  private readonly listUsersStateSubject = new BehaviorSubject<ListUsersState>({ status: 'idle' });
  readonly listUsersState$: Observable<ListUsersState> = this.listUsersStateSubject.asObservable();
  private pendingList?: Subscription;

  constructor(
    private readonly config: ApiConfig,
    private readonly store: SessionStore,
  ) {}

  createUser(username: string): void {
    this.pendingCreate?.unsubscribe(); // cancels a pending create only, never a delete
    this.createStateSubject.next({ status: 'pending', username });

    // The shared rule, so the front end rejects exactly what the API rejects.
    const call: Observable<CreateUserResult> = Username.safeParse(username).success
      ? apiCall(this.config, this.store, { method: 'POST', path: '/users', body: { username }, codes: CREATE_CODES }).pipe(
          map((answer): CreateUserResult => (answer.status === 'ok' ? toCreateResult(answer) : answer)),
        )
      : of(apiFailure('invalid_request', INVALID_USERNAME)); // no request sent

    this.pendingCreate = call
      .pipe(tap((result) => this.createStateSubject.next(result)))
      // Forward `next` only: a completed subject would ignore every later call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.createResultSubject.next(result));
  }

  deleteUser(username: string): void {
    this.pendingDelete?.unsubscribe(); // cancels a pending delete only, never a create
    this.deleteStateSubject.next({ status: 'pending', username });

    const call: Observable<DeleteUserResult> = Username.safeParse(username).success
      ? apiCall(this.config, this.store, {
          method: 'DELETE',
          path: `/users/${encodeURIComponent(username)}`,
          codes: DELETE_CODES,
        }).pipe(map((answer): DeleteUserResult => (answer.status === 'ok' ? toDeleteResult(answer, username) : answer)))
      : of(apiFailure('invalid_request', INVALID_USERNAME)); // no request sent

    this.pendingDelete = call
      .pipe(tap((result) => this.deleteStateSubject.next(result)))
      // Forward `next` only: a completed subject would ignore every later call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.deleteResultSubject.next(result));
  }

  listUsers(): void {
    this.pendingList?.unsubscribe(); // cancels a pending list only, never a create or a delete
    this.listUsersStateSubject.next({ status: 'pending' });

    this.pendingList = apiCall(this.config, this.store, { method: 'GET', path: '/users', codes: LIST_CODES })
      .pipe(
        map((answer): ListUsersResult => (answer.status === 'ok' ? toListResult(answer) : answer)),
        tap((result) => this.listUsersStateSubject.next(result)),
      )
      // Forward `next` only: a completed subject would ignore every later call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.listUsersResultSubject.next(result));
  }
}

// A 201 must carry `username` and `password` strings (docs/FRONTEND_SERVICES.md section 13.5). The
// generated password is kept in the success value only, the one exception to
// docs/FRONTEND_SERVICES.md section 2, rule 6.
function toCreateResult(answer: ApiOk): CreateUserResult {
  const body = (answer.body ?? {}) as { username?: unknown; password?: unknown };
  if (answer.httpStatus === 201 && typeof body.username === 'string' && typeof body.password === 'string') {
    return { status: 'success', user: { username: body.username, password: body.password } };
  }
  return transportFailure('unexpected', `API answered ${answer.httpStatus} with an unexpected body`);
}

function toDeleteResult(answer: ApiOk, username: string): DeleteUserResult {
  if (answer.httpStatus === 204) return { status: 'success', username };
  return transportFailure('unexpected', `API answered ${answer.httpStatus} with an unexpected body`);
}

// A success is checked for its status, the array under `users` and each element's `username`
// (docs/FRONTEND_SERVICES.md section 13.5).
function toListResult(answer: ApiOk): ListUsersResult {
  const body = answer.body as { users?: unknown } | undefined;
  if (answer.httpStatus === 200 && Array.isArray(body?.users) && body.users.every((u) => hasString(u, 'username'))) {
    return { status: 'success', users: body.users as UserSummary[] };
  }
  return unexpectedAnswer(answer);
}
