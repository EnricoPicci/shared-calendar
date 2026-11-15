import { UpdateSettingsBody, type ApiErrorCode, type CalendarSettings } from '@shared-calendar/shared';
import { BehaviorSubject, Observable, ReplaySubject, Subscription, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { apiCall, hasString, invalidRequest, unexpectedAnswer, type ApiConfig, type ApiFailure, type ApiOk } from './api';
import type { SettingsResult, SettingsState, UpdateSettingsResult, UpdateSettingsState } from './calendar-settings.types';
import type { SessionStore } from './session.store';

// docs/FRONTEND_SERVICES.md section 15. GET /calendar/settings (both roles) and
// PUT /calendar/settings (admin only): two pairs of streams, independent of each other.

const LOAD_CODES = ['forbidden', 'internal_error'] as const satisfies readonly ApiErrorCode[];
const UPDATE_CODES = ['forbidden', 'invalid_json', 'invalid_request', 'concurrent_update', 'internal_error'] as const satisfies readonly ApiErrorCode[];

export class CalendarSettingsService {
  // Pair 1: load.
  private readonly settingsResultSubject = new ReplaySubject<SettingsResult>(1);
  readonly settingsResult$: Observable<SettingsResult> = this.settingsResultSubject.asObservable();
  private readonly settingsStateSubject = new BehaviorSubject<SettingsState>({ status: 'idle' });
  readonly settingsState$: Observable<SettingsState> = this.settingsStateSubject.asObservable();
  private pendingLoad?: Subscription;

  // Pair 2: update.
  private readonly updateResultSubject = new ReplaySubject<UpdateSettingsResult>(1);
  readonly updateResult$: Observable<UpdateSettingsResult> = this.updateResultSubject.asObservable();
  private readonly updateStateSubject = new BehaviorSubject<UpdateSettingsState>({ status: 'idle' });
  readonly updateState$: Observable<UpdateSettingsState> = this.updateStateSubject.asObservable();
  private pendingUpdate?: Subscription;

  constructor(
    private readonly config: ApiConfig,
    private readonly store: SessionStore,
  ) {}

  load(): void {
    this.pendingLoad?.unsubscribe(); // cancels a pending load only, never an update
    this.settingsStateSubject.next({ status: 'pending' });

    this.pendingLoad = apiCall(this.config, this.store, { method: 'GET', path: '/calendar/settings', codes: LOAD_CODES })
      .pipe(
        map((answer): SettingsResult => (answer.status === 'ok' ? toSettingsResult(answer) : answer)),
        tap((result) => this.settingsStateSubject.next(result)),
      )
      // Forward `next` only: a completed subject would ignore every later call (section 3.2).
      .subscribe((result) => this.settingsResultSubject.next(result));
  }

  update(settings: UpdateSettingsBody): void {
    this.pendingUpdate?.unsubscribe(); // cancels a pending update only, never a load
    this.updateStateSubject.next({ status: 'pending', settings });

    // The shared schema, so the front end rejects exactly what the API rejects (section 15.4).
    const body = UpdateSettingsBody.safeParse(settings);
    const call: Observable<UpdateSettingsResult> = body.success
      ? apiCall(this.config, this.store, { method: 'PUT', path: '/calendar/settings', body: body.data, codes: UPDATE_CODES }).pipe(
          map((answer): UpdateSettingsResult => (answer.status === 'ok' ? toSettingsResult(answer) : answer)),
        )
      : of(invalidRequest(body.error)); // no request sent

    this.pendingUpdate = call
      .pipe(tap((result) => this.updateStateSubject.next(result)))
      // Forward `next` only: a completed subject would ignore every later call (section 3.2).
      .subscribe((result) => this.updateResultSubject.next(result));
  }
}

// Section 15.5: the status and the object's id (`timeZone`); the rest is trusted to the contract.
// Both routes answer 200 with CalendarSettings.
function toSettingsResult(answer: ApiOk): { status: 'success'; settings: CalendarSettings } | ApiFailure<never> {
  if (answer.httpStatus === 200 && hasString(answer.body, 'timeZone')) {
    return { status: 'success', settings: answer.body as CalendarSettings };
  }
  return unexpectedAnswer(answer);
}
