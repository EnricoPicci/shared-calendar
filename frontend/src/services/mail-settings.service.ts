import { MailSettingsBody, type ApiErrorCode, type MailSettings } from '@shared-calendar/shared';
import { BehaviorSubject, Observable, ReplaySubject, Subscription, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { apiCall, invalidRequest, unexpectedAnswer, type ApiConfig, type ApiFailure, type ApiOk } from './api';
import type { MailSettingsResult, MailSettingsState, UpdateMailSettingsResult, UpdateMailSettingsState } from './mail-settings.types';
import type { SessionStore } from './session.store';

// The daily mail's settings (docs/FRONTEND_SERVICES.md section 25): GET /mail/settings and
// PUT /mail/settings, the Administrator's (docs/EMAIL_ARCHITECTURE.md section 9.1), two pairs of
// streams, independent of each other, as for the calendar's settings.

const GET_CODES = ['forbidden', 'mail_unavailable', 'internal_error'] as const satisfies readonly ApiErrorCode[];
const UPDATE_CODES = ['forbidden', 'invalid_json', 'invalid_request', 'mail_unavailable', 'internal_error'] as const satisfies readonly ApiErrorCode[];

export class MailSettingsService {
  // Pair 1: the read.
  private readonly settingsResultSubject = new ReplaySubject<MailSettingsResult>(1);
  readonly settingsResult$: Observable<MailSettingsResult> = this.settingsResultSubject.asObservable();
  private readonly settingsStateSubject = new BehaviorSubject<MailSettingsState>({ status: 'idle' });
  readonly settingsState$: Observable<MailSettingsState> = this.settingsStateSubject.asObservable();
  private pendingGet?: Subscription;

  // Pair 2: the save.
  private readonly updateResultSubject = new ReplaySubject<UpdateMailSettingsResult>(1);
  readonly updateResult$: Observable<UpdateMailSettingsResult> = this.updateResultSubject.asObservable();
  private readonly updateStateSubject = new BehaviorSubject<UpdateMailSettingsState>({ status: 'idle' });
  readonly updateState$: Observable<UpdateMailSettingsState> = this.updateStateSubject.asObservable();
  private pendingUpdate?: Subscription;

  constructor(
    private readonly config: ApiConfig,
    private readonly store: SessionStore,
  ) {}

  getSettings(): void {
    this.pendingGet?.unsubscribe(); // cancels a pending read only, never a save
    this.settingsStateSubject.next({ status: 'pending' });

    this.pendingGet = apiCall(this.config, this.store, { method: 'GET', path: '/mail/settings', codes: GET_CODES })
      .pipe(
        map((answer): MailSettingsResult => (answer.status === 'ok' ? toSettingsResult(answer) : answer)),
        tap((result) => this.settingsStateSubject.next(result)),
      )
      // Forward `next` only: a completed subject would ignore every later call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.settingsResultSubject.next(result));
  }

  updateSettings(settings: MailSettingsBody): void {
    this.pendingUpdate?.unsubscribe(); // cancels a pending save only, never a read
    this.updateStateSubject.next({ status: 'pending', settings });

    // Checked with the shared schema, so the front end refuses exactly what the API refuses: a
    // switch and a whole hour, 0 to 23.
    const body = MailSettingsBody.safeParse(settings);
    const call: Observable<UpdateMailSettingsResult> = body.success
      ? apiCall(this.config, this.store, { method: 'PUT', path: '/mail/settings', body: body.data, codes: UPDATE_CODES }).pipe(
          map((answer): UpdateMailSettingsResult => (answer.status === 'ok' ? toSettingsResult(answer) : answer)),
        )
      : of(invalidRequest(body.error)); // no request sent

    this.pendingUpdate = call
      .pipe(tap((result) => this.updateStateSubject.next(result)))
      // Forward `next` only: a completed subject would ignore every later call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.updateResultSubject.next(result));
  }
}

// Both routes answer 200 with the two values; a success is checked for its status and for both,
// a switch and a number, since the settings have no other field to identify them by.
function toSettingsResult(answer: ApiOk): { status: 'success'; settings: MailSettings } | ApiFailure<never> {
  const body = answer.body as { dailyEnabled?: unknown; dailyHour?: unknown } | null | undefined;
  if (answer.httpStatus === 200 && typeof body?.dailyEnabled === 'boolean' && typeof body.dailyHour === 'number') {
    return { status: 'success', settings: { dailyEnabled: body.dailyEnabled, dailyHour: body.dailyHour } };
  }
  return unexpectedAnswer(answer);
}
