import {
  AppointmentIdParam,
  AppointmentsQuery,
  BookBody,
  ChangeBody,
  NoteBody,
  type ApiErrorCode,
  type Appointment,
} from '@shared-calendar/shared';
import { BehaviorSubject, Observable, ReplaySubject, Subscription, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { apiCall, hasString, invalidRequest, unexpectedAnswer, type ApiConfig, type ApiFailure, type ApiOk } from './api';
import type {
  AppointmentsQueryInput,
  AppointmentsResult,
  AppointmentsState,
  BookResult,
  BookState,
  CancelResult,
  CancelState,
  ChangeResult,
  ChangeState,
  UpdateNoteResult,
  UpdateNoteState,
} from './appointments.types';
import type { SessionStore } from './session.store';

// The appointments (docs/FRONTEND_SERVICES.md section 19), docs/SHARED_CALENDAR_SPEC.md section
// 11.1, routes 16–20: list, book, cancel, change and edit the note, for both roles. One pair of
// streams per method, each independent of the others. What depends on the caller's role (a User's
// start, which must be the start of a slot, the Administrator's `username`) and what only the
// server knows (notice, horizon, availability and its slots, ownership) is the API's to answer (docs/FRONTEND_SERVICES.md section 8,
// decision 42).

// Each route's error codes as docs/ARCHITECTURE.md section 4 lists them.
const LIST_CODES = ['forbidden', 'invalid_request', 'internal_error'] as const satisfies readonly ApiErrorCode[];
const BOOKING_RULE_CODES = [
  'booking_in_past',
  'booking_notice_too_short',
  'booking_beyond_horizon',
  'outside_availability',
  'user_busy',
  'slot_taken',
  'appointment_limit_reached',
] as const satisfies readonly ApiErrorCode[];
const BOOK_CODES = [
  'forbidden',
  'invalid_json',
  'invalid_request',
  'user_not_found',
  'target_not_user',
  ...BOOKING_RULE_CODES,
  'concurrent_update',
  'internal_error',
] as const satisfies readonly ApiErrorCode[];
const CANCEL_CODES = [
  'forbidden',
  'invalid_request',
  'appointment_not_found',
  'appointment_not_active',
  'cancellation_notice_too_short',
  'concurrent_update',
  'internal_error',
] as const satisfies readonly ApiErrorCode[];
const CHANGE_CODES = [
  'forbidden',
  'invalid_json',
  'invalid_request',
  'appointment_not_found',
  'appointment_not_active',
  'cancellation_notice_too_short',
  ...BOOKING_RULE_CODES,
  'user_not_found',
  'concurrent_update',
  'internal_error',
] as const satisfies readonly ApiErrorCode[];
const UPDATE_NOTE_CODES = [
  'forbidden',
  'invalid_json',
  'invalid_request',
  'appointment_not_found',
  'appointment_not_active',
  'concurrent_update',
  'internal_error',
] as const satisfies readonly ApiErrorCode[];

const appointmentPath = (appointmentId: string) => `/calendar/appointments/${encodeURIComponent(appointmentId)}`;

export class AppointmentsService {
  // Pair 1: list.
  private readonly appointmentsResultSubject = new ReplaySubject<AppointmentsResult>(1);
  readonly appointmentsResult$: Observable<AppointmentsResult> = this.appointmentsResultSubject.asObservable();
  private readonly appointmentsStateSubject = new BehaviorSubject<AppointmentsState>({ status: 'idle' });
  readonly appointmentsState$: Observable<AppointmentsState> = this.appointmentsStateSubject.asObservable();
  private pendingList?: Subscription;

  // Pair 2: book.
  private readonly bookResultSubject = new ReplaySubject<BookResult>(1);
  readonly bookResult$: Observable<BookResult> = this.bookResultSubject.asObservable();
  private readonly bookStateSubject = new BehaviorSubject<BookState>({ status: 'idle' });
  readonly bookState$: Observable<BookState> = this.bookStateSubject.asObservable();
  private pendingBook?: Subscription;

  // Pair 3: cancel.
  private readonly cancelResultSubject = new ReplaySubject<CancelResult>(1);
  readonly cancelResult$: Observable<CancelResult> = this.cancelResultSubject.asObservable();
  private readonly cancelStateSubject = new BehaviorSubject<CancelState>({ status: 'idle' });
  readonly cancelState$: Observable<CancelState> = this.cancelStateSubject.asObservable();
  private pendingCancel?: Subscription;

  // Pair 4: change.
  private readonly changeResultSubject = new ReplaySubject<ChangeResult>(1);
  readonly changeResult$: Observable<ChangeResult> = this.changeResultSubject.asObservable();
  private readonly changeStateSubject = new BehaviorSubject<ChangeState>({ status: 'idle' });
  readonly changeState$: Observable<ChangeState> = this.changeStateSubject.asObservable();
  private pendingChange?: Subscription;

  // Pair 5: updateNote.
  private readonly updateNoteResultSubject = new ReplaySubject<UpdateNoteResult>(1);
  readonly updateNoteResult$: Observable<UpdateNoteResult> = this.updateNoteResultSubject.asObservable();
  private readonly updateNoteStateSubject = new BehaviorSubject<UpdateNoteState>({ status: 'idle' });
  readonly updateNoteState$: Observable<UpdateNoteState> = this.updateNoteStateSubject.asObservable();
  private pendingUpdateNote?: Subscription;

  constructor(
    private readonly config: ApiConfig,
    private readonly store: SessionStore,
  ) {}

  list(query: AppointmentsQueryInput): void {
    this.pendingList?.unsubscribe(); // cancels a pending list only, never another method's call
    this.appointmentsStateSubject.next({ status: 'pending', query });

    // zod's parsed output is sent, so `status=booked` goes out when the caller left it out
    // (docs/FRONTEND_SERVICES.md section 8, decision 42).
    const parsed = AppointmentsQuery.safeParse(query);
    const call: Observable<AppointmentsResult> = parsed.success
      ? apiCall(this.config, this.store, {
          method: 'GET',
          path: '/calendar/appointments',
          query: definedOnly(parsed.data),
          codes: LIST_CODES,
        }).pipe(map((answer): AppointmentsResult => (answer.status === 'ok' ? toAppointmentsResult(answer) : answer)))
      : of(invalidRequest(parsed.error)); // no request sent

    this.pendingList = call
      .pipe(tap((result) => this.appointmentsStateSubject.next(result)))
      // Forward `next` only: a completed subject would ignore every later call
      // (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.appointmentsResultSubject.next(result));
  }

  // `overbook` goes out as the caller gives it, absent staying absent; whether the caller may send
  // `true` is the API's to answer (docs/SHARED_CALENDAR_SPEC.md R-BOOK-13).
  book(booking: BookBody): void {
    this.pendingBook?.unsubscribe(); // cancels a pending book only
    this.bookStateSubject.next({ status: 'pending', booking });

    const body = BookBody.safeParse(booking);
    const call: Observable<BookResult> = body.success
      ? apiCall(this.config, this.store, { method: 'POST', path: '/calendar/appointments', body: body.data, codes: BOOK_CODES }).pipe(
          map((answer): BookResult => (answer.status === 'ok' ? toAppointmentResult(answer, 201) : answer)),
        )
      : of(invalidRequest(body.error)); // no request sent

    this.pendingBook = call
      .pipe(tap((result) => this.bookStateSubject.next(result)))
      // Forward `next` only, so the subject stays open (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.bookResultSubject.next(result));
  }

  cancel(appointmentId: string): void {
    this.pendingCancel?.unsubscribe(); // cancels a pending cancel only
    this.cancelStateSubject.next({ status: 'pending', appointmentId });

    const path = AppointmentIdParam.safeParse({ appointmentId });
    // The route reads no body: none is sent.
    const call: Observable<CancelResult> = path.success
      ? apiCall(this.config, this.store, {
          method: 'POST',
          path: `${appointmentPath(path.data.appointmentId)}/cancel`,
          codes: CANCEL_CODES,
        }).pipe(map((answer): CancelResult => (answer.status === 'ok' ? toAppointmentResult(answer, 200) : answer)))
      : of(invalidRequest(path.error)); // no request sent

    this.pendingCancel = call
      .pipe(tap((result) => this.cancelStateSubject.next(result)))
      // Forward `next` only, so the subject stays open (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.cancelResultSubject.next(result));
  }

  // `overbook` as in `book`.
  change(appointmentId: string, change: ChangeBody): void {
    this.pendingChange?.unsubscribe(); // cancels a pending change only
    this.changeStateSubject.next({ status: 'pending', appointmentId, change });

    // The path first, then the body: the handler's order (docs/SHARED_CALENDAR_SPEC.md section 8.4).
    const path = AppointmentIdParam.safeParse({ appointmentId });
    const body = ChangeBody.safeParse(change);
    const call: Observable<ChangeResult> = !path.success
      ? of(invalidRequest(path.error)) // no request sent
      : !body.success
        ? of(invalidRequest(body.error)) // no request sent
        : apiCall(this.config, this.store, {
            method: 'POST',
            path: `${appointmentPath(path.data.appointmentId)}/change`,
            body: body.data,
            codes: CHANGE_CODES,
          }).pipe(map((answer): ChangeResult => (answer.status === 'ok' ? toChangeResult(answer) : answer)));

    this.pendingChange = call
      .pipe(tap((result) => this.changeStateSubject.next(result)))
      // Forward `next` only, so the subject stays open (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.changeResultSubject.next(result));
  }

  updateNote(appointmentId: string, note: string | null): void {
    this.pendingUpdateNote?.unsubscribe(); // cancels a pending updateNote only
    this.updateNoteStateSubject.next({ status: 'pending', appointmentId, note });

    // The path first, then the body; the parsed note (trimmed, empty → null) is what is sent.
    const path = AppointmentIdParam.safeParse({ appointmentId });
    const body = NoteBody.safeParse({ note });
    const call: Observable<UpdateNoteResult> = !path.success
      ? of(invalidRequest(path.error)) // no request sent
      : !body.success
        ? of(invalidRequest(body.error)) // no request sent
        : apiCall(this.config, this.store, {
            method: 'PATCH',
            path: appointmentPath(path.data.appointmentId),
            body: body.data,
            codes: UPDATE_NOTE_CODES,
          }).pipe(map((answer): UpdateNoteResult => (answer.status === 'ok' ? toAppointmentResult(answer, 200) : answer)));

    this.pendingUpdateNote = call
      .pipe(tap((result) => this.updateNoteStateSubject.next(result)))
      // Forward `next` only, so the subject stays open (docs/FRONTEND_SERVICES.md section 3.2).
      .subscribe((result) => this.updateNoteResultSubject.next(result));
  }
}

// The parsed query without its absent keys, in the schema's order (URLSearchParams would send an
// undefined value as the text "undefined").
function definedOnly(query: AppointmentsQuery): Record<string, string> {
  return Object.fromEntries(Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

// The checks of a success (docs/FRONTEND_SERVICES.md section 19.5): the status, the top-level
// shape and the appointment ids; the rest is trusted to the contract.
function toAppointmentsResult(answer: ApiOk): AppointmentsResult {
  const body = answer.body as { appointments?: unknown } | undefined;
  if (answer.httpStatus === 200 && Array.isArray(body?.appointments) && body.appointments.every((a) => hasString(a, 'appointmentId'))) {
    return { status: 'success', appointments: body.appointments as Appointment[] };
  }
  return unexpectedAnswer(answer);
}

function toAppointmentResult(answer: ApiOk, status: 200 | 201): { status: 'success'; appointment: Appointment } | ApiFailure<never> {
  if (answer.httpStatus === status && hasString(answer.body, 'appointmentId')) {
    return { status: 'success', appointment: answer.body as Appointment };
  }
  return unexpectedAnswer(answer);
}

function toChangeResult(answer: ApiOk): ChangeResult {
  const body = answer.body as { cancelled?: unknown; booked?: unknown } | undefined;
  if (answer.httpStatus === 201 && hasString(body?.cancelled, 'appointmentId') && hasString(body.booked, 'appointmentId')) {
    return { status: 'success', cancelled: body.cancelled as Appointment, booked: body.booked as Appointment };
  }
  return unexpectedAnswer(answer);
}
