import type { Role } from '@shared-calendar/shared';
import type { Subscription } from 'rxjs';
import { bookingFor, bookingText, timeChoice, userChoice } from '../logic/booking';
import { failureText } from '../logic/texts';
import type { AppointmentBlock, BusyBlock, DayModel, Placed, SlotBlock, WeekModel, WindowBlock } from '../logic/week.model';
import type { WeekScreen } from '../logic/week.screen';
import type { AppointmentsService } from '../services/appointments.service';
import type { UsersService } from '../services/users.service';

// What the week view uses: of the WeekScreen its stream, the three moves and the detail of an
// appointment; of the AppointmentsService the booking and the cancellation; of the UsersService
// the list of Users, which only the Administrator's book dialog asks for; and the role, for
// which parts of the book dialog to show.
export type WeekDeps = {
  screen: Pick<WeekScreen, 'week$' | 'previous' | 'next' | 'today' | 'detail'>;
  appointments: Pick<AppointmentsService, 'book' | 'bookState$' | 'cancel' | 'cancelState$'>;
  users: Pick<UsersService, 'listUsers' | 'listUsersState$'>;
  role: Role;
};

// The texts of the detail dialog: each is a field of the AppointmentDetail and the class of its
// element.
const DETAIL_TEXTS = ['when', 'typeName', 'who', 'note', 'booked', 'hint'] as const;

// The week view (docs/FRONTEND_ARCHITECTURE.md sections 3 and 4): wires the element #week of
// index.html. It draws what the logic layer hands over ready (places, times and names as text),
// forwards three buttons, and opens two dialogs: a free slot opens the book dialog, an
// appointment its detail, which can cancel it.
export function mountWeek(root: HTMLElement, { screen, appointments, users, role }: WeekDeps): Subscription {
  // 1. Find the elements, once.
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  // A copy of the element inside a <template>.
  const copy = (id: string) => find<HTMLTemplateElement>(`#${id}`).content.firstElementChild!.cloneNode(true) as HTMLElement;

  const label = find('.week-label');
  const loading = find('.loading');
  const failure = find('.failure');
  const zone = find('.zone');
  const zoneName = find('.zone-name');
  const legend = find('.legend');
  const week = find('.week');
  const hours = find('.hours');
  const days = find('.days');

  const book = find<HTMLDialogElement>('dialog.book');
  const bookForm = find<HTMLFormElement>('dialog.book form');
  const bookWhat = find('dialog.book .what');
  const bookChoices = find('dialog.book .choices');
  const bookUser = find('dialog.book [name="username"]');
  const bookUsersMessage = find('dialog.book .users-message');
  const bookStart = find<HTMLSelectElement>('dialog.book [name="start"]');
  const bookEnd = find<HTMLSelectElement>('dialog.book [name="end"]');
  const bookError = find('dialog.book .error');
  const bookSubmit = find<HTMLButtonElement>('dialog.book .submit');

  const detail = find<HTMLDialogElement>('dialog.detail');
  const detailTexts = DETAIL_TEXTS.map((field) => [field, find(`dialog.detail .${field}`)] as const);
  const detailError = find('dialog.detail .error');
  const detailCancel = find<HTMLButtonElement>('dialog.detail .cancel');

  // 2. Pure view state (docs/FRONTEND_ARCHITECTURE.md section 3, rule 10): what each open dialog
  // is about, and whether its action was asked for since it opened. A result is shown in a
  // dialog only when that dialog asked for it: the state streams keep their last value, which
  // may belong to an earlier opening.
  let booking: { slot: SlotBlock; zone: string } | null = null; // null while the book dialog is closed
  let bookAsked = false;
  let bookPending = false;
  let usersReady = false; // the Administrator has a User to choose
  let shown: string | null = null; // the appointment of the open detail
  let cancelAsked = false;
  let cancelling: string | null = null; // the appointment whose cancellation is under way

  const enableBook = () => {
    bookSubmit.disabled = bookPending || (role === 'admin' && !usersReady);
  };
  const enableCancel = () => {
    detailCancel.disabled = cancelling !== null && cancelling === shown;
  };

  // 3. Drawing a week: copies of the templates, filled with textContent. A place is set as a
  // property, which a strict Content-Security-Policy allows
  // (docs/FRONTEND_ARCHITECTURE.md section 3, rule 6).
  // A block's copy, put in its place and in its lane, with its type's colour when it has one.
  const place = (id: string, block: Placed, colour?: number) => {
    const element = copy(id);
    element.style.top = block.top;
    element.style.height = block.height;
    element.classList.add(`lane-${block.lane}-of-${block.lanes}`);
    if (colour !== undefined) element.classList.add(`type-${colour}`);
    return element;
  };
  const windowFor = (block: WindowBlock) => {
    const element = place('tpl-window', block, block.colour);
    element.querySelector('.type-name')!.textContent = block.typeName;
    return element;
  };
  const busyFor = (block: BusyBlock) => {
    const element = place('tpl-busy', block);
    element.querySelector('.time')!.textContent = block.time;
    return element;
  };
  const slotFor = (block: SlotBlock, timeZone: string) => {
    const element = place('tpl-slot', block, block.colour);
    element.querySelector('.time')!.textContent = block.time;
    element.onclick = () => openBook(block, timeZone);
    return element;
  };
  const appointmentFor = (block: AppointmentBlock) => {
    const element = place('tpl-appointment', block, block.colour);
    element.querySelector('.time')!.textContent = block.time;
    element.querySelector('.who')!.textContent = block.who;
    element.querySelector('.note')!.textContent = block.note;
    element.onclick = () => openDetail(block.appointmentId);
    return element;
  };

  const dayFor = (day: DayModel, model: WeekModel) => {
    const element = copy('tpl-day');
    element.classList.toggle('today', day.today);
    element.querySelector('h3')!.textContent = day.label;
    const body = element.querySelector<HTMLElement>('.day-body')!;
    body.style.setProperty('--hours', String(model.hours.length));
    body.append(
      ...day.windows.map(windowFor),
      ...day.busy.map(busyFor),
      ...day.slots.map((slot) => slotFor(slot, model.timeZone)),
      ...day.appointments.map(appointmentFor),
    );
    return element;
  };
  const itemFor = (id: string, text: string, colour?: number) => {
    const element = copy(id);
    element.textContent = text;
    if (colour !== undefined) element.classList.add(`type-${colour}`);
    return element;
  };

  // The week now in the page: it is rebuilt only when the stream brings another one. The
  // dialogs are outside it: a week that arrives while one is open leaves it as it is.
  let drawn: WeekModel | null = null;
  const draw = (model: WeekModel | null) => {
    drawn = model;
    zone.hidden = model === null;
    zoneName.textContent = model?.timeZone ?? '';
    legend.replaceChildren(...(model?.legend ?? []).map((type) => itemFor('tpl-legend-item', type.name, type.colour)));
    hours.replaceChildren(...(model?.hours ?? []).map((hour) => itemFor('tpl-hour', hour)));
    days.replaceChildren(...(model?.days ?? []).map((day) => dayFor(day, model!)));
  };

  // 4. The dialogs. Opening one is a pure view action; at every opening it shows nothing of the
  // time before: the form is reset and the failure emptied.
  // The choices of a list of the book dialog: one <option> per text.
  const choices = (select: HTMLElement, texts: readonly string[]) => select.replaceChildren(...texts.map((text) => itemFor('tpl-option', text)));

  const openBook = (slot: SlotBlock, timeZone: string) => {
    bookForm.reset();
    bookError.textContent = '';
    booking = { slot, zone: timeZone };
    bookAsked = false;
    bookWhat.textContent = bookingText(slot);
    if (role === 'admin') {
      // The times the Administrator may choose, set to the slot's own; then the Users, asked
      // for at every opening: the list's states arrive through its stream.
      const times = timeChoice(slot, timeZone);
      choices(bookStart, times.starts);
      choices(bookEnd, times.ends);
      bookStart.value = times.start;
      bookEnd.value = times.end;
      usersReady = false;
      users.listUsers();
    }
    enableBook();
    book.showModal();
  };
  const openDetail = (appointmentId: string) => {
    const found = screen.detail(appointmentId);
    if (found === null) return; // the week on screen no longer holds it
    shown = appointmentId;
    cancelAsked = false;
    for (const [field, element] of detailTexts) element.textContent = found[field];
    detailError.textContent = '';
    detailCancel.hidden = !found.canCancel;
    enableCancel();
    detail.showModal();
  };
  // Closing, by "Close", by the Escape key or after a success, only forgets what the dialog was
  // about.
  book.onclose = () => {
    booking = null;
    bookAsked = false;
  };
  detail.onclose = () => {
    shown = null;
    cancelAsked = false;
  };

  // 5. The user's actions become calls. "Book" and "Cancel appointment" only call the service:
  // what follows on screen comes from the streams.
  find('.previous').onclick = () => screen.previous();
  find('.today').onclick = () => screen.today();
  find('.next').onclick = () => screen.next();
  find('dialog.book .close').onclick = () => book.close();
  find('dialog.detail .close').onclick = () => detail.close();
  // Without preventDefault the browser would send the form itself and load the page again.
  bookForm.onsubmit = (event) => {
    event.preventDefault();
    const data = new FormData(bookForm);
    const field = (name: string) => String(data.get(name) ?? '');
    bookAsked = true;
    appointments.book(
      bookingFor(booking!.slot, booking!.zone, role, { note: field('note'), username: field('username'), start: field('start'), end: field('end') }),
    );
  };
  detailCancel.onclick = () => {
    cancelAsked = true;
    appointments.cancel(shown!);
  };

  // 6. The streams' notifications fill the elements.
  const subscription = screen.week$.subscribe((state) => {
    label.textContent = state.label;
    loading.hidden = !state.loading;
    week.classList.toggle('stale', state.loading);
    failure.hidden = state.failure === null;
    failure.textContent = state.failure ?? '';
    if (state.week !== drawn) draw(state.week);
  });
  // A booking: "Book" is disabled while one is under way; the dialog that asked for it closes
  // on its success and shows its failure in plain words, staying open with what was typed.
  subscription.add(
    appointments.bookState$.subscribe((state) => {
      bookPending = state.status === 'pending';
      enableBook();
      if (!bookAsked) return;
      bookError.textContent = state.status === 'failure' ? failureText(state.reason) : '';
      if (state.status === 'success') book.close();
    }),
  );
  // A cancellation, the same way; its button is disabled while the one under way is of the
  // appointment shown.
  subscription.add(
    appointments.cancelState$.subscribe((state) => {
      cancelling = state.status === 'pending' ? state.appointmentId : null;
      enableCancel();
      if (!cancelAsked) return;
      detailError.textContent = state.status === 'failure' ? failureText(state.reason) : '';
      if (state.status === 'success') detail.close();
    }),
  );
  // The list of Users, for the book dialog that asked for it: the picker's choices are rebuilt
  // when a list arrives, which is at opening, before anything can be chosen.
  subscription.add(
    users.listUsersState$.subscribe((state) => {
      if (booking === null) return;
      const choice = userChoice(state);
      choices(bookUser, choice.usernames);
      bookUsersMessage.textContent = choice.message;
      usersReady = choice.ready;
      enableBook();
    }),
  );
  // The parts of the book dialog that are the Administrator's.
  bookChoices.hidden = role !== 'admin';

  // 7. Leaving the view: the element stays in the page, only hidden, so one person's week,
  // notes and names are removed before the next person signs in
  // (docs/FRONTEND_ARCHITECTURE.md section 3, rule 9).
  subscription.add(() => {
    book.close();
    detail.close();
    draw(null);
    label.textContent = '';
    loading.hidden = true;
    week.classList.remove('stale');
    failure.hidden = true;
    failure.textContent = '';

    bookForm.reset();
    for (const list of [bookUser, bookStart, bookEnd]) list.replaceChildren();
    for (const text of [bookWhat, bookUsersMessage, bookError, detailError]) text.textContent = '';
    for (const [, element] of detailTexts) element.textContent = '';
    bookChoices.hidden = true;
    bookSubmit.disabled = false;
    detailCancel.hidden = true;
    detailCancel.disabled = false;
  });
  return subscription;
}
