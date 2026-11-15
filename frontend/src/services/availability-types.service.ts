import { TypeBody, TypeIdParam, type ApiErrorCode, type AvailabilityType } from '@shared-calendar/shared';
import { BehaviorSubject, Observable, ReplaySubject, Subscription, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { apiCall, hasString, invalidRequest, unexpectedAnswer, type ApiConfig, type ApiFailure, type ApiOk } from './api';
import type {
  CreateTypeResult,
  CreateTypeState,
  RemoveTypeResult,
  RemoveTypeState,
  RenameTypeResult,
  RenameTypeState,
  TypesResult,
  TypesState,
} from './availability-types.types';
import type { SessionStore } from './session.store';

// The availability types (docs/FRONTEND_SERVICES.md section 16), docs/SHARED_CALENDAR_SPEC.md
// section 11.1, routes 3–6: load (both roles), create, rename and remove (admin only). One pair of
// streams per method, each independent of the others.

const LOAD_CODES = ['forbidden', 'internal_error'] as const satisfies readonly ApiErrorCode[];
const CREATE_CODES = [
  'forbidden',
  'invalid_json',
  'invalid_request',
  'type_name_exists',
  'limit_reached',
  'concurrent_update',
  'internal_error',
] as const satisfies readonly ApiErrorCode[];
const RENAME_CODES = [
  'forbidden',
  'invalid_json',
  'invalid_request',
  'type_not_found',
  'type_name_exists',
  'concurrent_update',
  'internal_error',
] as const satisfies readonly ApiErrorCode[];
const REMOVE_CODES = [
  'forbidden',
  'invalid_request',
  'type_not_found',
  'type_in_use',
  'concurrent_update',
  'internal_error',
] as const satisfies readonly ApiErrorCode[];

export class AvailabilityTypesService {
  // Pair 1: load.
  private readonly typesResultSubject = new ReplaySubject<TypesResult>(1);
  readonly typesResult$: Observable<TypesResult> = this.typesResultSubject.asObservable();
  private readonly typesStateSubject = new BehaviorSubject<TypesState>({ status: 'idle' });
  readonly typesState$: Observable<TypesState> = this.typesStateSubject.asObservable();
  private pendingLoad?: Subscription;

  // Pair 2: create.
  private readonly createResultSubject = new ReplaySubject<CreateTypeResult>(1);
  readonly createResult$: Observable<CreateTypeResult> = this.createResultSubject.asObservable();
  private readonly createStateSubject = new BehaviorSubject<CreateTypeState>({ status: 'idle' });
  readonly createState$: Observable<CreateTypeState> = this.createStateSubject.asObservable();
  private pendingCreate?: Subscription;

  // Pair 3: rename.
  private readonly renameResultSubject = new ReplaySubject<RenameTypeResult>(1);
  readonly renameResult$: Observable<RenameTypeResult> = this.renameResultSubject.asObservable();
  private readonly renameStateSubject = new BehaviorSubject<RenameTypeState>({ status: 'idle' });
  readonly renameState$: Observable<RenameTypeState> = this.renameStateSubject.asObservable();
  private pendingRename?: Subscription;

  // Pair 4: remove.
  private readonly removeResultSubject = new ReplaySubject<RemoveTypeResult>(1);
  readonly removeResult$: Observable<RemoveTypeResult> = this.removeResultSubject.asObservable();
  private readonly removeStateSubject = new BehaviorSubject<RemoveTypeState>({ status: 'idle' });
  readonly removeState$: Observable<RemoveTypeState> = this.removeStateSubject.asObservable();
  private pendingRemove?: Subscription;

  constructor(
    private readonly config: ApiConfig,
    private readonly store: SessionStore,
  ) {}

  load(): void {
    this.pendingLoad?.unsubscribe(); // cancels a pending load only, never another method's call
    this.typesStateSubject.next({ status: 'pending' });

    this.pendingLoad = apiCall(this.config, this.store, { method: 'GET', path: '/calendar/types', codes: LOAD_CODES })
      .pipe(
        map((answer): TypesResult => (answer.status === 'ok' ? toTypesResult(answer) : answer)),
        tap((result) => this.typesStateSubject.next(result)),
      )
      // Forward `next` only: a completed subject would ignore every later call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.typesResultSubject.next(result));
  }

  create(name: string): void {
    this.pendingCreate?.unsubscribe(); // cancels a pending create only
    this.createStateSubject.next({ status: 'pending', name });

    // Checked with the shared schema, and its parsed output (the trimmed name) is what is sent
    // (docs/FRONTEND_SERVICES.md section 16.4).
    const body = TypeBody.safeParse({ name });
    const call: Observable<CreateTypeResult> = body.success
      ? apiCall(this.config, this.store, { method: 'POST', path: '/calendar/types', body: body.data, codes: CREATE_CODES }).pipe(
          map((answer): CreateTypeResult => (answer.status === 'ok' ? toTypeResult(answer, 201) : answer)),
        )
      : of(invalidRequest(body.error)); // no request sent

    this.pendingCreate = call
      .pipe(tap((result) => this.createStateSubject.next(result)))
      // Feed the subject with `next` only, so it stays open for the next call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.createResultSubject.next(result));
  }

  rename(typeId: string, name: string): void {
    this.pendingRename?.unsubscribe(); // cancels a pending rename only
    this.renameStateSubject.next({ status: 'pending', typeId, name });

    // The path first, then the body: the handler's order.
    const path = TypeIdParam.safeParse({ typeId });
    const body = TypeBody.safeParse({ name });
    const call: Observable<RenameTypeResult> = !path.success
      ? of(invalidRequest(path.error)) // no request sent
      : !body.success
        ? of(invalidRequest(body.error)) // no request sent
        : apiCall(this.config, this.store, {
            method: 'PUT',
            path: `/calendar/types/${encodeURIComponent(path.data.typeId)}`,
            body: body.data,
            codes: RENAME_CODES,
          }).pipe(map((answer): RenameTypeResult => (answer.status === 'ok' ? toTypeResult(answer, 200) : answer)));

    this.pendingRename = call
      .pipe(tap((result) => this.renameStateSubject.next(result)))
      // Feed the subject with `next` only, so it stays open for the next call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.renameResultSubject.next(result));
  }

  remove(typeId: string): void {
    this.pendingRemove?.unsubscribe(); // cancels a pending remove only
    this.removeStateSubject.next({ status: 'pending', typeId });

    const path = TypeIdParam.safeParse({ typeId });
    const call: Observable<RemoveTypeResult> = path.success
      ? apiCall(this.config, this.store, {
          method: 'DELETE',
          path: `/calendar/types/${encodeURIComponent(path.data.typeId)}`,
          codes: REMOVE_CODES,
        }).pipe(
          map((answer): RemoveTypeResult =>
            answer.status !== 'ok' ? answer : answer.httpStatus === 204 ? { status: 'success', typeId } : unexpectedAnswer(answer),
          ),
        )
      : of(invalidRequest(path.error)); // no request sent

    this.pendingRemove = call
      .pipe(tap((result) => this.removeStateSubject.next(result)))
      // Feed the subject with `next` only, so it stays open for the next call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.removeResultSubject.next(result));
  }
}

// A success is checked for its status, the array under `types` and each element's `typeId`
// (docs/FRONTEND_SERVICES.md section 16.5).
function toTypesResult(answer: ApiOk): TypesResult {
  const body = answer.body as { types?: unknown } | undefined;
  if (answer.httpStatus === 200 && Array.isArray(body?.types) && body.types.every((t) => hasString(t, 'typeId'))) {
    return { status: 'success', types: body.types as AvailabilityType[] };
  }
  return unexpectedAnswer(answer);
}

// The status and the object's `typeId`; the rest is trusted to the contract.
function toTypeResult(answer: ApiOk, status: 201 | 200): { status: 'success'; type: AvailabilityType } | ApiFailure<never> {
  if (answer.httpStatus === status && hasString(answer.body, 'typeId')) return { status: 'success', type: answer.body as AvailabilityType };
  return unexpectedAnswer(answer);
}
