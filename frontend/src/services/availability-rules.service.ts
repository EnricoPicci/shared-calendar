import {
  DateParam,
  OneOffWindowBody,
  OverrideBody,
  PatternBody,
  PatternIdParam,
  WindowIdParam,
  type ApiErrorCode,
  type DateOverride,
  type OneOffWindow,
  type WeeklyPattern,
  type WindowBody,
} from '@shared-calendar/shared';
import { BehaviorSubject, Observable, ReplaySubject, Subscription, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { apiCall, hasString, invalidRequest, unexpectedAnswer, type ApiConfig, type ApiFailure, type ApiOk } from './api';
import type {
  CreatePatternResult,
  CreatePatternState,
  CreateWindowResult,
  CreateWindowState,
  DeleteOverrideResult,
  DeleteOverrideState,
  DeletePatternResult,
  DeletePatternState,
  DeleteWindowResult,
  DeleteWindowState,
  PatternsResult,
  PatternsState,
  SetOverrideResult,
  SetOverrideState,
  UpdatePatternResult,
  UpdatePatternState,
} from './availability-rules.types';
import type { SessionStore } from './session.store';

// The Administrator's availability rules (docs/FRONTEND_SERVICES.md section 17): weekly patterns,
// date overrides and one-off windows, docs/SHARED_CALENDAR_SPEC.md section 11.1, routes 7–14. One
// pair of streams per method, each independent of the others. Every route here is admin only: a
// User gets `forbidden`.

// Each route's error codes as docs/ARCHITECTURE.md section 4 lists them; where the calendar spec
// differs, the architecture wins (docs/FRONTEND_SERVICES.md section 8, decision 32).
const LOAD_PATTERNS_CODES = ['forbidden', 'internal_error'] as const satisfies readonly ApiErrorCode[];
const CREATE_PATTERN_CODES = [
  'forbidden',
  'invalid_json',
  'invalid_request',
  'type_not_found',
  'limit_reached',
  'availability_overlap',
  'availability_conflict',
  'concurrent_update',
  'internal_error',
] as const satisfies readonly ApiErrorCode[];
const UPDATE_PATTERN_CODES = [
  'forbidden',
  'invalid_json',
  'invalid_request',
  'pattern_not_found',
  'type_not_found',
  'availability_overlap',
  'availability_conflict',
  'concurrent_update',
  'internal_error',
] as const satisfies readonly ApiErrorCode[];
const DELETE_PATTERN_CODES = [
  'forbidden',
  'invalid_request',
  'pattern_not_found',
  'availability_conflict',
  'concurrent_update',
  'internal_error',
] as const satisfies readonly ApiErrorCode[];
const SET_OVERRIDE_CODES = [
  'forbidden',
  'invalid_json',
  'invalid_request',
  'date_in_past',
  'type_not_found',
  'availability_overlap',
  'availability_conflict',
  'concurrent_update',
  'internal_error',
] as const satisfies readonly ApiErrorCode[];
const DELETE_OVERRIDE_CODES = [
  'forbidden',
  'invalid_request',
  'override_not_found',
  'date_in_past',
  'availability_overlap',
  'availability_conflict',
  'concurrent_update',
  'internal_error',
] as const satisfies readonly ApiErrorCode[];
const CREATE_WINDOW_CODES = [
  'forbidden',
  'invalid_json',
  'invalid_request',
  'date_in_past',
  'type_not_found',
  'limit_reached',
  'availability_overlap',
  'concurrent_update',
  'internal_error',
] as const satisfies readonly ApiErrorCode[];
const DELETE_WINDOW_CODES = [
  'forbidden',
  'invalid_request',
  'window_not_found',
  'date_in_past',
  'availability_conflict',
  'concurrent_update',
  'internal_error',
] as const satisfies readonly ApiErrorCode[];

export class AvailabilityRulesService {
  // Pair 1: loadPatterns.
  private readonly patternsResultSubject = new ReplaySubject<PatternsResult>(1);
  readonly patternsResult$: Observable<PatternsResult> = this.patternsResultSubject.asObservable();
  private readonly patternsStateSubject = new BehaviorSubject<PatternsState>({ status: 'idle' });
  readonly patternsState$: Observable<PatternsState> = this.patternsStateSubject.asObservable();
  private pendingLoadPatterns?: Subscription;

  // Pair 2: createPattern.
  private readonly createPatternResultSubject = new ReplaySubject<CreatePatternResult>(1);
  readonly createPatternResult$: Observable<CreatePatternResult> = this.createPatternResultSubject.asObservable();
  private readonly createPatternStateSubject = new BehaviorSubject<CreatePatternState>({ status: 'idle' });
  readonly createPatternState$: Observable<CreatePatternState> = this.createPatternStateSubject.asObservable();
  private pendingCreatePattern?: Subscription;

  // Pair 3: updatePattern.
  private readonly updatePatternResultSubject = new ReplaySubject<UpdatePatternResult>(1);
  readonly updatePatternResult$: Observable<UpdatePatternResult> = this.updatePatternResultSubject.asObservable();
  private readonly updatePatternStateSubject = new BehaviorSubject<UpdatePatternState>({ status: 'idle' });
  readonly updatePatternState$: Observable<UpdatePatternState> = this.updatePatternStateSubject.asObservable();
  private pendingUpdatePattern?: Subscription;

  // Pair 4: deletePattern.
  private readonly deletePatternResultSubject = new ReplaySubject<DeletePatternResult>(1);
  readonly deletePatternResult$: Observable<DeletePatternResult> = this.deletePatternResultSubject.asObservable();
  private readonly deletePatternStateSubject = new BehaviorSubject<DeletePatternState>({ status: 'idle' });
  readonly deletePatternState$: Observable<DeletePatternState> = this.deletePatternStateSubject.asObservable();
  private pendingDeletePattern?: Subscription;

  // Pair 5: setOverride.
  private readonly setOverrideResultSubject = new ReplaySubject<SetOverrideResult>(1);
  readonly setOverrideResult$: Observable<SetOverrideResult> = this.setOverrideResultSubject.asObservable();
  private readonly setOverrideStateSubject = new BehaviorSubject<SetOverrideState>({ status: 'idle' });
  readonly setOverrideState$: Observable<SetOverrideState> = this.setOverrideStateSubject.asObservable();
  private pendingSetOverride?: Subscription;

  // Pair 6: deleteOverride.
  private readonly deleteOverrideResultSubject = new ReplaySubject<DeleteOverrideResult>(1);
  readonly deleteOverrideResult$: Observable<DeleteOverrideResult> = this.deleteOverrideResultSubject.asObservable();
  private readonly deleteOverrideStateSubject = new BehaviorSubject<DeleteOverrideState>({ status: 'idle' });
  readonly deleteOverrideState$: Observable<DeleteOverrideState> = this.deleteOverrideStateSubject.asObservable();
  private pendingDeleteOverride?: Subscription;

  // Pair 7: createWindow.
  private readonly createWindowResultSubject = new ReplaySubject<CreateWindowResult>(1);
  readonly createWindowResult$: Observable<CreateWindowResult> = this.createWindowResultSubject.asObservable();
  private readonly createWindowStateSubject = new BehaviorSubject<CreateWindowState>({ status: 'idle' });
  readonly createWindowState$: Observable<CreateWindowState> = this.createWindowStateSubject.asObservable();
  private pendingCreateWindow?: Subscription;

  // Pair 8: deleteWindow.
  private readonly deleteWindowResultSubject = new ReplaySubject<DeleteWindowResult>(1);
  readonly deleteWindowResult$: Observable<DeleteWindowResult> = this.deleteWindowResultSubject.asObservable();
  private readonly deleteWindowStateSubject = new BehaviorSubject<DeleteWindowState>({ status: 'idle' });
  readonly deleteWindowState$: Observable<DeleteWindowState> = this.deleteWindowStateSubject.asObservable();
  private pendingDeleteWindow?: Subscription;

  constructor(
    private readonly config: ApiConfig,
    private readonly store: SessionStore,
  ) {}

  loadPatterns(): void {
    // Cancels a pending loadPatterns only, never another method's call.
    this.pendingLoadPatterns?.unsubscribe();
    this.patternsStateSubject.next({ status: 'pending' });

    this.pendingLoadPatterns = apiCall(this.config, this.store, { method: 'GET', path: '/calendar/patterns', codes: LOAD_PATTERNS_CODES })
      .pipe(
        map((answer): PatternsResult => (answer.status === 'ok' ? toPatternsResult(answer) : answer)),
        tap((result) => this.patternsStateSubject.next(result)),
      )
      // Forward `next` only: a completed subject would ignore every later call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.patternsResultSubject.next(result));
  }

  createPattern(pattern: PatternBody): void {
    this.pendingCreatePattern?.unsubscribe(); // cancels a pending createPattern only
    this.createPatternStateSubject.next({ status: 'pending', pattern });

    // Checked with the shared schema, and the schema's parsed output is what is sent
    // (docs/FRONTEND_SERVICES.md section 8, decision 33).
    const body = PatternBody.safeParse(pattern);
    const call: Observable<CreatePatternResult> = body.success
      ? apiCall(this.config, this.store, { method: 'POST', path: '/calendar/patterns', body: body.data, codes: CREATE_PATTERN_CODES }).pipe(
          map((answer): CreatePatternResult => (answer.status === 'ok' ? toPatternResult(answer, 201) : answer)),
        )
      : of(invalidRequest(body.error)); // no request sent

    this.pendingCreatePattern = call
      .pipe(tap((result) => this.createPatternStateSubject.next(result)))
      // Feed the subject with `next` only, so it stays open for the next call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.createPatternResultSubject.next(result));
  }

  updatePattern(patternId: string, pattern: PatternBody): void {
    this.pendingUpdatePattern?.unsubscribe(); // cancels a pending updatePattern only
    this.updatePatternStateSubject.next({ status: 'pending', patternId, pattern });

    // The path first, then the body: the handler's order.
    const path = PatternIdParam.safeParse({ patternId });
    const body = PatternBody.safeParse(pattern);
    const call: Observable<UpdatePatternResult> = !path.success
      ? of(invalidRequest(path.error)) // no request sent
      : !body.success
        ? of(invalidRequest(body.error)) // no request sent
        : apiCall(this.config, this.store, {
            method: 'PUT',
            path: `/calendar/patterns/${encodeURIComponent(path.data.patternId)}`,
            body: body.data,
            codes: UPDATE_PATTERN_CODES,
          }).pipe(map((answer): UpdatePatternResult => (answer.status === 'ok' ? toPatternResult(answer, 200) : answer)));

    this.pendingUpdatePattern = call
      .pipe(tap((result) => this.updatePatternStateSubject.next(result)))
      // Feed the subject with `next` only, so it stays open for the next call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.updatePatternResultSubject.next(result));
  }

  deletePattern(patternId: string): void {
    this.pendingDeletePattern?.unsubscribe(); // cancels a pending deletePattern only
    this.deletePatternStateSubject.next({ status: 'pending', patternId });

    const path = PatternIdParam.safeParse({ patternId });
    const call: Observable<DeletePatternResult> = path.success
      ? apiCall(this.config, this.store, {
          method: 'DELETE',
          path: `/calendar/patterns/${encodeURIComponent(path.data.patternId)}`,
          codes: DELETE_PATTERN_CODES,
        }).pipe(map((answer): DeletePatternResult => (answer.status === 'ok' ? toDeleted(answer, { patternId }) : answer)))
      : of(invalidRequest(path.error)); // no request sent

    this.pendingDeletePattern = call
      .pipe(tap((result) => this.deletePatternStateSubject.next(result)))
      // Feed the subject with `next` only, so it stays open for the next call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.deletePatternResultSubject.next(result));
  }

  setOverride(date: string, windows: WindowBody[]): void {
    this.pendingSetOverride?.unsubscribe(); // cancels a pending setOverride only
    this.setOverrideStateSubject.next({ status: 'pending', date, windows });

    const path = DateParam.safeParse({ date });
    const body = OverrideBody.safeParse({ windows });
    const call: Observable<SetOverrideResult> = !path.success
      ? of(invalidRequest(path.error)) // no request sent
      : !body.success
        ? of(invalidRequest(body.error)) // no request sent
        : apiCall(this.config, this.store, {
            method: 'PUT',
            path: `/calendar/overrides/${encodeURIComponent(path.data.date)}`,
            body: body.data,
            codes: SET_OVERRIDE_CODES,
          }).pipe(map((answer): SetOverrideResult => (answer.status === 'ok' ? toOverrideResult(answer) : answer)));

    this.pendingSetOverride = call
      .pipe(tap((result) => this.setOverrideStateSubject.next(result)))
      // Feed the subject with `next` only, so it stays open for the next call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.setOverrideResultSubject.next(result));
  }

  deleteOverride(date: string): void {
    this.pendingDeleteOverride?.unsubscribe(); // cancels a pending deleteOverride only
    this.deleteOverrideStateSubject.next({ status: 'pending', date });

    const path = DateParam.safeParse({ date });
    const call: Observable<DeleteOverrideResult> = path.success
      ? apiCall(this.config, this.store, {
          method: 'DELETE',
          path: `/calendar/overrides/${encodeURIComponent(path.data.date)}`,
          codes: DELETE_OVERRIDE_CODES,
        }).pipe(map((answer): DeleteOverrideResult => (answer.status === 'ok' ? toDeleted(answer, { date }) : answer)))
      : of(invalidRequest(path.error)); // no request sent

    this.pendingDeleteOverride = call
      .pipe(tap((result) => this.deleteOverrideStateSubject.next(result)))
      // Feed the subject with `next` only, so it stays open for the next call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.deleteOverrideResultSubject.next(result));
  }

  createWindow(window: OneOffWindowBody): void {
    this.pendingCreateWindow?.unsubscribe(); // cancels a pending createWindow only
    this.createWindowStateSubject.next({ status: 'pending', window });

    const body = OneOffWindowBody.safeParse(window);
    const call: Observable<CreateWindowResult> = body.success
      ? apiCall(this.config, this.store, { method: 'POST', path: '/calendar/windows', body: body.data, codes: CREATE_WINDOW_CODES }).pipe(
          map((answer): CreateWindowResult => (answer.status === 'ok' ? toWindowResult(answer) : answer)),
        )
      : of(invalidRequest(body.error)); // no request sent

    this.pendingCreateWindow = call
      .pipe(tap((result) => this.createWindowStateSubject.next(result)))
      // Feed the subject with `next` only, so it stays open for the next call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.createWindowResultSubject.next(result));
  }

  deleteWindow(windowId: string): void {
    this.pendingDeleteWindow?.unsubscribe(); // cancels a pending deleteWindow only
    this.deleteWindowStateSubject.next({ status: 'pending', windowId });

    const path = WindowIdParam.safeParse({ windowId });
    const call: Observable<DeleteWindowResult> = path.success
      ? apiCall(this.config, this.store, {
          method: 'DELETE',
          path: `/calendar/windows/${encodeURIComponent(path.data.windowId)}`,
          codes: DELETE_WINDOW_CODES,
        }).pipe(map((answer): DeleteWindowResult => (answer.status === 'ok' ? toDeleted(answer, { windowId }) : answer)))
      : of(invalidRequest(path.error)); // no request sent

    this.pendingDeleteWindow = call
      .pipe(tap((result) => this.deleteWindowStateSubject.next(result)))
      // Feed the subject with `next` only, so it stays open for the next call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.deleteWindowResultSubject.next(result));
  }
}

// A success is checked for its status, its top-level shape and the object's id; the rest is trusted
// to the contract (docs/FRONTEND_SERVICES.md section 17.5).

function toPatternsResult(answer: ApiOk): PatternsResult {
  const body = answer.body as { patterns?: unknown } | undefined;
  if (answer.httpStatus === 200 && Array.isArray(body?.patterns) && body.patterns.every((p) => hasString(p, 'patternId'))) {
    return { status: 'success', patterns: body.patterns as WeeklyPattern[] };
  }
  return unexpectedAnswer(answer);
}

function toPatternResult(answer: ApiOk, status: 201 | 200): { status: 'success'; pattern: WeeklyPattern } | ApiFailure<never> {
  if (answer.httpStatus === status && hasString(answer.body, 'patternId')) {
    return { status: 'success', pattern: answer.body as WeeklyPattern };
  }
  return unexpectedAnswer(answer);
}

function toOverrideResult(answer: ApiOk): SetOverrideResult {
  if (answer.httpStatus === 200 && hasString(answer.body, 'date')) return { status: 'success', override: answer.body as DateOverride };
  return unexpectedAnswer(answer);
}

function toWindowResult(answer: ApiOk): CreateWindowResult {
  if (answer.httpStatus === 201 && hasString(answer.body, 'windowId')) return { status: 'success', window: answer.body as OneOffWindow };
  return unexpectedAnswer(answer);
}

// A delete's 204 has no body, so the success carries the id the call was made with
// (docs/FRONTEND_SERVICES.md section 8, decision 34).
function toDeleted<T extends object>(answer: ApiOk, id: T): ({ status: 'success' } & T) | ApiFailure<never> {
  return answer.httpStatus === 204 ? { status: 'success', ...id } : unexpectedAnswer(answer);
}
