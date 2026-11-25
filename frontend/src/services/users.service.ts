import { CreateUserBody, UpdateUserBody, Username, type ApiErrorCode, type UserProfile, type UserSummary } from '@shared-calendar/shared';
import { BehaviorSubject, Observable, ReplaySubject, Subscription, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { apiCall, apiFailure, hasString, invalidRequest, transportFailure, unexpectedAnswer, type ApiConfig, type ApiOk } from './api';
import type { SessionStore } from './session.store';
import type {
  CreateUserResult,
  CreateUserState,
  DeleteUserResult,
  DeleteUserState,
  ListUsersResult,
  ListUsersState,
  UpdateUserResult,
  UpdateUserState,
} from './users.types';

// The administrator's four calls (docs/FRONTEND_SERVICES.md section 13): POST /users,
// DELETE /users/{username}, GET /users and PUT /users/{username}, four pairs of streams,
// independent of each other.

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
// cannot_edit_admin: another administrator's facts are their own (docs/EMAIL_ARCHITECTURE.md
// section 4.2).
const UPDATE_CODES = ['forbidden', 'invalid_json', 'invalid_request', 'user_not_found', 'cannot_edit_admin', 'internal_error'] as const satisfies readonly ApiErrorCode[];

// The fields of a user as GET /users and PUT /users/{username} answer them that the page shows.
const FACT_KEYS = ['username', 'givenName', 'familyName', 'email', 'address'] as const;

/** What "Create user" sends: the username and the four facts, as the form holds them. */
export type NewUser = { username: string } & UserProfile;
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

  // Pair 4: update.
  private readonly updateResultSubject = new ReplaySubject<UpdateUserResult>(1);
  readonly updateUserResult$: Observable<UpdateUserResult> = this.updateResultSubject.asObservable();
  private readonly updateStateSubject = new BehaviorSubject<UpdateUserState>({ status: 'idle' });
  readonly updateUserState$: Observable<UpdateUserState> = this.updateStateSubject.asObservable();
  private pendingUpdate?: Subscription;

  constructor(
    private readonly config: ApiConfig,
    private readonly store: SessionStore,
  ) {}

  createUser(user: NewUser): void {
    this.pendingCreate?.unsubscribe(); // cancels a pending create only, never a delete
    this.createStateSubject.next({ status: 'pending', username: user.username });

    // The shared rule, so the front end rejects exactly what the API rejects; what is sent is what
    // the rule makes of the input (the facts trimmed, the e-mail lower-cased).
    // The username is checked first, for its own sentence.
    const checked = CreateUserBody.safeParse(user);
    const call: Observable<CreateUserResult> = !Username.safeParse(user.username).success
      ? of(apiFailure('invalid_request', INVALID_USERNAME)) // no request sent
      : !checked.success
        ? of(invalidRequest(checked.error)) // no request sent
        : apiCall(this.config, this.store, { method: 'POST', path: '/users', body: checked.data, codes: CREATE_CODES }).pipe(
            map((answer): CreateUserResult => (answer.status === 'ok' ? toCreateResult(answer) : answer)),
          );

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

  // Replaces the four facts of `username` (docs/EMAIL_ARCHITECTURE.md section 9.1).
  updateUser(username: string, profile: UserProfile): void {
    this.pendingUpdate?.unsubscribe(); // cancels a pending update only, never another call
    this.updateStateSubject.next({ status: 'pending', username });

    const checked = UpdateUserBody.safeParse(profile);
    const call: Observable<UpdateUserResult> = !Username.safeParse(username).success
      ? of(apiFailure('invalid_request', INVALID_USERNAME)) // no request sent
      : !checked.success
        ? of(invalidRequest(checked.error)) // no request sent
        : apiCall(this.config, this.store, {
            method: 'PUT',
            path: `/users/${encodeURIComponent(username)}`,
            body: checked.data,
            codes: UPDATE_CODES,
          }).pipe(map((answer): UpdateUserResult => (answer.status === 'ok' ? toUpdateResult(answer) : answer)));

    this.pendingUpdate = call
      .pipe(tap((result) => this.updateStateSubject.next(result)))
      // Forward `next` only: a completed subject would ignore every later call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.updateResultSubject.next(result));
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

// A 200 is checked for its `username` and four facts, as GET /users answers a User.
function toUpdateResult(answer: ApiOk): UpdateUserResult {
  const body = answer.body;
  if (answer.httpStatus === 200 && FACT_KEYS.every((key) => hasString(body, key))) {
    return { status: 'success', user: body as UserSummary };
  }
  return unexpectedAnswer(answer);
}

// A success is checked for its status, the array under `users` and each element's `username`
// and four facts, which the users screen shows (docs/FRONTEND_SERVICES.md section 13.5).
function toListResult(answer: ApiOk): ListUsersResult {
  const body = answer.body as { users?: unknown } | undefined;
  if (answer.httpStatus === 200 && Array.isArray(body?.users) && body.users.every((u) => FACT_KEYS.every((key) => hasString(u, key)))) {
    return { status: 'success', users: body.users as UserSummary[] };
  }
  return unexpectedAnswer(answer);
}
