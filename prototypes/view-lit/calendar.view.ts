import { html, nothing, render } from 'lit-html';
import { BehaviorSubject, combineLatest, merge, type Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import type { BookState, CancelState } from '../../frontend/src/services/appointments.types';
import type { ListUsersState } from '../../frontend/src/services/users.types';
import type { CalendarDeps } from '../common/app';
import { bookingFor, explain, type AppointmentBlock, type DayModel, type Placed, type SlotBlock, type WeekModel, type WeekState } from '../common/logic';

// The calendar view, lit-html: pure functions from one state object to the markup, and a mount
// function that builds that object from the streams and renders at every notification.

// Pure view state: what the open dialog is about, and whether it has been submitted since it was
// opened (an earlier attempt's failure is not this dialog's).
type Ui = { booking: SlotBlock | null; shown: AppointmentBlock | null; tried: boolean };
const CLOSED: Ui = { booking: null, shown: null, tried: false };

type State = { week: WeekState; users: ListUsersState; book: BookState; cancel: CancelState; ui: Ui };
type Handlers = {
  signOut: () => void;
  previous: () => void;
  today: () => void;
  next: () => void;
  openBook: (slot: SlotBlock) => void;
  openDetail: (appointment: AppointmentBlock) => void;
  close: () => void;
  book: (event: SubmitEvent) => void;
  cancel: () => void;
};

// ── The templates ────────────────────────────────────────────────────────────────────────────

// A block's place, set through the element's `style` property (the `.style` bindings below), not
// its attribute: a strict Content-Security-Policy refuses inline style attributes, lit-html's
// `styleMap` included.
const at = (block: Placed) => `top: ${block.top}; height: ${block.height}`;

const dayTemplate = (day: DayModel, on: Handlers) => html`
  <section class="day ${day.today ? 'today' : ''}">
    <h3>${day.label}</h3>
    <div class="day-body">
      ${day.windows.map((w) => html`<div class="block window type-${w.colour}" .style=${at(w)}>${w.typeName}</div>`)}
      ${day.busy.map((b) => html`<div class="block busy" .style=${at(b)}><span class="time">${b.time}</span> busy</div>`)}
      ${day.slots.map(
        (s) => html`
          <button type="button" class="block slot type-${s.colour}" .style=${at(s)} title="Book ${s.typeName}, ${s.time}" @click=${() => on.openBook(s)}>
            <span class="time">${s.time}</span> free
          </button>
        `,
      )}
      ${day.appointments.map(
        (a) => html`
          <button type="button" class="block appointment type-${a.colour}" .style=${at(a)} @click=${() => on.openDetail(a)}>
            <span class="time">${a.time}</span> <strong class="who">${a.who}</strong> <span class="note">${a.note}</span>
          </button>
        `,
      )}
    </div>
  </section>
`;

const weekTemplate = (week: WeekModel, loading: boolean, on: Handlers) => html`
  <p class="zone">Times are in the calendar's time zone, ${week.timeZone}.</p>
  <ul class="legend">
    ${week.types.map((type) => html`<li class="type-${type.colour}">${type.name}</li>`)}
  </ul>
  <div class="week ${loading ? 'stale' : ''}" .style=${`--hours: ${week.hours.length}`}>
    <ol class="hours">
      ${week.hours.map((hour) => html`<li>${hour}</li>`)}
    </ol>
    <div class="days">${week.days.map((day) => dayTemplate(day, on))}</div>
  </div>
`;

// The content of a dialog exists only while the dialog is open: a new form at every opening.
const bookTemplate = (slot: SlotBlock, { book, users, ui }: State, isAdmin: boolean, on: Handlers) => html`
  <form @submit=${on.book}>
    <h3>Book an appointment</h3>
    <p class="what">${slot.day}, ${slot.time} · ${slot.typeName}</p>
    ${isAdmin
      ? html`<label class="for-user">For
          <select name="username">
            ${users.status === 'success' ? users.users.map((user) => html`<option>${user.username}</option>`) : nothing}
          </select>
        </label>`
      : nothing}
    <label>Note <textarea name="note" rows="3"></textarea></label>
    <p class="error" role="alert">${ui.tried && book.status === 'failure' ? explain(book) : ''}</p>
    <div class="actions">
      <button type="button" class="close" @click=${on.close}>Close</button>
      <button class="primary submit" ?disabled=${book.status === 'pending'}>Book</button>
    </div>
  </form>
`;

const detailTemplate = (appointment: AppointmentBlock, { cancel, ui }: State, on: Handlers) => html`
  <div class="detail-body">
    <h3>Appointment</h3>
    <dl>
      <dt>When</dt>
      <dd class="when">${appointment.day}, ${appointment.time}</dd>
      <dt>Type</dt>
      <dd class="type">${appointment.typeName}</dd>
      <dt>Who</dt>
      <dd class="who">${appointment.who}</dd>
      <dt>Note</dt>
      <dd class="note">${appointment.note === '' ? '—' : appointment.note}</dd>
    </dl>
    <p class="hint">${appointment.cancelHint}</p>
    <p class="error" role="alert">${ui.tried && cancel.status === 'failure' ? explain(cancel) : ''}</p>
    <div class="actions">
      <button type="button" class="close" @click=${on.close}>Close</button>
      ${appointment.canCancel
        ? html`<button type="button" class="danger cancel" ?disabled=${cancel.status === 'pending'} @click=${on.cancel}>Cancel appointment</button>`
        : nothing}
    </div>
  </div>
`;

const calendarTemplate = (session: CalendarDeps['session'], state: State, on: Handlers) => html`
  <header class="bar">
    <strong>Shared calendar</strong>
    <span class="who">${session.username} (${session.role === 'admin' ? 'Administrator' : 'User'})</span>
    <button type="button" class="sign-out" @click=${on.signOut}>Sign out</button>
  </header>

  <nav class="toolbar">
    <button type="button" class="previous" aria-label="Previous week" @click=${on.previous}>‹</button>
    <button type="button" class="today" @click=${on.today}>Today</button>
    <button type="button" class="next" aria-label="Next week" @click=${on.next}>›</button>
    <h2 class="week-label">${state.week.label}</h2>
    ${state.week.loading ? html`<span class="loading">Loading…</span>` : nothing}
  </nav>
  ${state.week.error === null ? nothing : html`<p class="error week-error" role="alert">${state.week.error}</p>`}
  ${state.week.week === null ? nothing : weekTemplate(state.week.week, state.week.loading, on)}

  <dialog class="book" @close=${on.close}>
    ${state.ui.booking === null ? nothing : bookTemplate(state.ui.booking, state, session.role === 'admin', on)}
  </dialog>
  <dialog class="detail" @close=${on.close}>
    ${state.ui.shown === null ? nothing : detailTemplate(state.ui.shown, state, on)}
  </dialog>
`;

// ── The wiring ───────────────────────────────────────────────────────────────────────────────

export function mountCalendar(root: HTMLElement, deps: CalendarDeps): Subscription {
  const { session, screen, appointments, users } = deps;
  const ui = new BehaviorSubject<Ui>(CLOSED);

  const on: Handlers = {
    signOut: () => deps.signOut(),
    previous: () => screen.previous(),
    today: () => screen.today(),
    next: () => screen.next(),
    openBook: (slot) => ui.next({ booking: slot, shown: null, tried: false }),
    openDetail: (appointment) => ui.next({ booking: null, shown: appointment, tried: false }),
    close: () => {
      if (ui.getValue() !== CLOSED) ui.next(CLOSED);
    },
    book: (event) => {
      event.preventDefault();
      const { booking } = ui.getValue();
      if (booking === null) return;
      const data = new FormData(event.target as HTMLFormElement);
      ui.next({ ...ui.getValue(), tried: true });
      appointments.book(bookingFor(booking, String(data.get('note') ?? ''), String(data.get('username') ?? '')));
    },
    cancel: () => {
      const { shown } = ui.getValue();
      if (shown === null) return;
      ui.next({ ...ui.getValue(), tried: true });
      appointments.cancel(shown.appointmentId);
    },
  };

  // A modal dialog is opened by a method, not by markup: after each render the two dialogs are
  // brought in line with the view state.
  const show = (selector: string, open: boolean) => {
    const dialog = root.querySelector<HTMLDialogElement>(selector)!;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  };

  const subscription = combineLatest({
    week: screen.week$,
    users: users.listUsersState$,
    book: appointments.bookState$,
    cancel: appointments.cancelState$,
    ui,
  }).subscribe((state) => {
    render(calendarTemplate(session, state, on), root);
    show('dialog.book', state.ui.booking !== null);
    show('dialog.detail', state.ui.shown !== null);
  });

  // A booking or a cancellation that succeeded closes its dialog.
  subscription.add(
    merge(appointments.bookResult$, appointments.cancelResult$)
      .pipe(filter((result) => result.status === 'success'))
      .subscribe(on.close),
  );
  // Leaving the view: the markup goes, and the week with it.
  subscription.add(() => render(nothing, root));
  return subscription;
}
