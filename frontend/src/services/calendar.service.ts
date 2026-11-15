import { CalendarQuery, type ApiErrorCode, type CalendarView } from '@shared-calendar/shared';
import { BehaviorSubject, Observable, ReplaySubject, Subscription, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { apiCall, apiFailure, hasString, invalidRequest, unexpectedAnswer, type ApiConfig, type ApiOk } from './api';
import type { CalendarResult, CalendarState } from './calendar.types';
import type { SessionStore } from './session.store';

// The calendar view (docs/FRONTEND_SERVICES.md section 18), docs/SHARED_CALENDAR_SPEC.md section
// 11.1, route 15: `load(from, to)` and `reload()`, both roles. One pair of streams for both
// methods: a reload is the same load again, so a new call of either cancels the other's pending
// call (docs/FRONTEND_SERVICES.md section 8, decision 39).

const CALENDAR_CODES = ['forbidden', 'invalid_request', 'internal_error'] as const satisfies readonly ApiErrorCode[];

export class CalendarService {
  private readonly calendarResultSubject = new ReplaySubject<CalendarResult>(1);
  readonly calendarResult$: Observable<CalendarResult> = this.calendarResultSubject.asObservable();
  private readonly calendarStateSubject = new BehaviorSubject<CalendarState>({ status: 'idle' });
  readonly calendarState$: Observable<CalendarState> = this.calendarStateSubject.asObservable();
  private pending?: Subscription;
  // The range of the last `load`, as given, whether that load succeeded or not: what `reload` runs.
  private last?: { from: string; to: string };

  constructor(
    private readonly config: ApiConfig,
    private readonly store: SessionStore,
  ) {}

  load(from: string, to: string): void {
    this.last = { from, to };
    this.run(from, to);
  }

  // Runs the last `load` again, for the view to call after a write succeeded
  // (docs/SHARED_CALENDAR_SPEC.md section 16.3). Before any `load` there is nothing to run: it
  // answers `invalid_request` without a request, still through pending
  // (docs/FRONTEND_SERVICES.md section 8, decision 23).
  reload(): void {
    if (this.last === undefined) {
      this.pending?.unsubscribe();
      this.calendarStateSubject.next({ status: 'pending' });
      this.emit(of(apiFailure('invalid_request', 'nothing loaded yet')));
      return;
    }
    this.run(this.last.from, this.last.to);
  }

  private run(from: string, to: string): void {
    this.pending?.unsubscribe(); // cancels a pending load or reload
    this.calendarStateSubject.next({ status: 'pending', from, to });

    // Checked with the shared schema; its parsed output is what is sent
    // (docs/FRONTEND_SERVICES.md section 8, decision 33).
    const query = CalendarQuery.safeParse({ from, to });
    this.emit(
      query.success
        ? apiCall(this.config, this.store, {
            method: 'GET',
            path: '/calendar',
            query: { from: query.data.from, to: query.data.to },
            codes: CALENDAR_CODES,
          }).pipe(map((answer): CalendarResult => (answer.status === 'ok' ? toCalendarResult(answer) : answer)))
        : of(invalidRequest(query.error)), // no request sent
    );
  }

  private emit(call: Observable<CalendarResult>): void {
    this.pending = call
      .pipe(tap((result) => this.calendarStateSubject.next(result)))
      // Forward `next` only: a completed subject would ignore every later call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.calendarResultSubject.next(result));
  }
}

// A success is checked for its status, the view's range and time zone and its two arrays; the rest
// is trusted to the contract (docs/FRONTEND_SERVICES.md section 18.5).
function toCalendarResult(answer: ApiOk): CalendarResult {
  const body = answer.body as { days?: unknown; appointments?: unknown } | undefined;
  if (
    answer.httpStatus === 200 &&
    ['timeZone', 'from', 'to'].every((key) => hasString(body, key)) &&
    Array.isArray(body?.days) &&
    Array.isArray(body.appointments)
  ) {
    return { status: 'success', calendar: body as CalendarView };
  }
  return unexpectedAnswer(answer);
}
