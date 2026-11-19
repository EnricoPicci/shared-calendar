import type { Role } from '@shared-calendar/shared';
import type { Subscription } from 'rxjs';
import type { Moving } from '../logic/appointment.detail';
import { bookingFor, bookingText, changeFor, timeChoice, userChoice } from '../logic/booking';
import { failureText } from '../logic/texts';
import type { AppointmentBlock, BusyBlock, DayModel, Placed, SlotBlock, WeekModel, WindowBlock } from '../logic/week.model';
import type { WeekScreen } from '../logic/week.screen';
import type { AppointmentsService } from '../services/appointments.service';
import type { UsersService } from '../services/users.service';

// What the week view uses: of the WeekScreen its stream, the three changes of week, the detail
// of an appointment, and the start and the end of an appointment's move to another time; of the
// AppointmentsService the four writes, each with its state; of the UsersService the list of
// Users, which only the Administrator's book dialog asks for; and the role, for which parts of
// the book dialog to show.
export type WeekDeps = {
  screen: Pick<WeekScreen, 'week$' | 'previous' | 'next' | 'today' | 'detail' | 'move' | 'keep'>;
  appointments: Pick<
    AppointmentsService,
    'book' | 'bookState$' | 'cancel' | 'cancelState$' | 'change' | 'changeState$' | 'updateNote' | 'updateNoteState$'
  >;
  users: Pick<UsersService, 'listUsers' | 'listUsersState$'>;
  role: Role;
};

// The texts of the detail dialog: each is a field of the AppointmentDetail and the class of its
// element.
const DETAIL_TEXTS = ['when', 'typeName', 'who', 'note', 'booked', 'hint'] as const;

// The week view (docs/FRONTEND_ARCHITECTURE.md sections 3 and 4): wires the element #week of
// index.html. It draws what the logic layer hands over ready (places, times and names as text),
// forwards three buttons, and opens two dialogs: a free slot opens the book dialog, an
// appointment its detail, in which its note is edited and which can cancel it or start its
// move to another time. While an appointment is being moved a banner says so, and a free slot
// opens the book dialog in its second mode, as the confirmation of the change.
export function mountWeek(root: HTMLElement, { screen, appointments, users, role }: WeekDeps): Subscription {
  // 1. Find the elements, once.
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const all = <T extends HTMLElement = HTMLElement>(selector: string) => [...root.querySelectorAll<T>(selector)];
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
  const banner = find('.moving');
  const bannerWhat = find('.moving-what');

  const book = find<HTMLDialogElement>('dialog.book');
  const bookForm = find<HTMLFormElement>('dialog.book form');
  const bookWhat = find('dialog.book .what');
  const bookOld = find('dialog.book .old');
  const bookNote = find<HTMLTextAreaElement>('dialog.book [name="note"]');
  // The parts of the book dialog shown in one of its two modes only.
  const inBooking = all('dialog.book .in-booking');
  const inChange = all('dialog.book .in-change');
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
  const detailChange = find<HTMLButtonElement>('dialog.detail .change');
  const detailCancel = find<HTMLButtonElement>('dialog.detail .cancel');
  const noted = find('dialog.detail .noted');
  const noteForm = find<HTMLFormElement>('dialog.detail .note-form');
  const noteField = find<HTMLTextAreaElement>('dialog.detail [name="note"]');
  const noteSave = find<HTMLButtonElement>('dialog.detail .note-form .submit');

  // 2. Pure view state (docs/FRONTEND_ARCHITECTURE.md section 3, rule 10): what each open dialog
  // is about, and whether its action was asked for since it opened. A result is shown in a
  // dialog only when that dialog asked for it: the state streams keep their last value, which
  // may belong to an earlier opening.
  // The appointment being moved, as the week screen last said it: the logic layer holds it, the
  // view only remembers what the stream brought, to know what a click on a slot opens.
  let moving: Moving | null = null;
  // null while the book dialog is closed. `moving` is the appointment the dialog moves to the
  // slot, in its second mode; null when it books the slot.
  let booking: { slot: SlotBlock; zone: string; moving: Moving | null } | null = null;
  let bookAsked = false; // "Book" or "Change", whichever the dialog's mode has
  let bookPending = false;
  let changePending = false;
  let usersReady = false; // the Administrator has a User to choose
  let shown: string | null = null; // the appointment of the open detail
  let cancelAsked = false;
  let cancelling: string | null = null; // the appointment whose cancellation is under way
  let noteAsked = false;
  let saving: string | null = null; // the appointment whose note is being saved

  // The confirmation of a change waits for a change under way only: it asks for no User.
  const enableBook = () => {
    bookSubmit.disabled = booking?.moving ? changePending : bookPending || (role === 'admin' && !usersReady);
  };
  const enableDetail = () => {
    detailCancel.disabled = cancelling !== null && cancelling === shown;
    noteSave.disabled = saving !== null && saving === shown;
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

  // The book dialog in one of its two modes: the fixed texts of both are in the page, and the
  // ones of the other mode are hidden.
  const bookMode = (change: boolean) => {
    for (const element of inBooking) element.hidden = change;
    for (const element of inChange) element.hidden = !change;
  };
  // A click on a free slot: the book dialog, which books the slot or, while an appointment is
  // being moved, confirms its move to the slot.
  const openBook = (slot: SlotBlock, timeZone: string) => {
    bookForm.reset();
    bookError.textContent = '';
    booking = { slot, zone: timeZone, moving };
    bookAsked = false;
    bookMode(moving !== null);
    bookWhat.textContent = bookingText(slot);
    // What a change adds: the time the appointment is moved from, and its note in the field.
    bookOld.textContent = moving?.when ?? '';
    bookNote.value = moving?.note ?? '';
    if (role === 'admin') {
      // The times the Administrator may choose, set to the slot's own.
      const times = timeChoice(slot, timeZone);
      choices(bookStart, times.starts);
      choices(bookEnd, times.ends);
      bookStart.value = times.start;
      bookEnd.value = times.end;
    }
    if (role === 'admin' && moving === null) {
      // The Users, asked for at every opening of a booking: the list's states arrive through
      // its stream. A change asks for none: the User is the old appointment's.
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
    noteAsked = false;
    for (const [field, element] of detailTexts) element.textContent = found[field];
    // The note: a field while it can be edited, the text to read otherwise.
    noteField.value = found.noteValue;
    noteForm.hidden = !found.canEditNote;
    noted.hidden = found.canEditNote;
    detailError.textContent = '';
    detailChange.hidden = !found.canChange;
    detailCancel.hidden = !found.canCancel;
    enableDetail();
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
    noteAsked = false;
  };

  // 5. The user's actions become calls. "Book", "Change" in the confirmation, "Save note" and
  // "Cancel appointment" only call the service, and the banner's button the week screen: what
  // follows on screen comes from the streams.
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
    const fields = { note: field('note'), username: field('username'), start: field('start'), end: field('end') };
    const { slot, zone: timeZone, moving: moved } = booking!;
    bookAsked = true;
    if (moved) appointments.change(moved.appointmentId, changeFor(slot, timeZone, role, fields));
    else appointments.book(bookingFor(slot, timeZone, role, fields));
  };
  // The note is sent as the field holds it: the shared schema, through the service, trims it
  // and makes a blank one null, which clears it.
  noteForm.onsubmit = (event) => {
    event.preventDefault();
    noteAsked = true;
    appointments.updateNote(shown!, noteField.value);
  };
  // "Change" closes the detail, a pure view action, and tells the week screen, which holds the
  // move from then on: the banner comes from its stream.
  detailChange.onclick = () => {
    const appointmentId = shown!;
    detail.close();
    screen.move(appointmentId);
  };
  find('.keep').onclick = () => screen.keep();
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
    // The move: the banner, and every appointment's button disabled until the move is over, so
    // that the one being moved cannot be cancelled half-way; a week just drawn gets the same.
    moving = state.moving;
    banner.hidden = moving === null;
    bannerWhat.textContent = moving?.what ?? '';
    for (const button of all<HTMLButtonElement>('.appointment')) button.disabled = moving !== null;
  });
  // A booking: "Book" is disabled while one is under way; the dialog that asked for it closes
  // on its success and shows its failure in plain words, staying open with what was typed. The
  // confirmation of a change is the same dialog and did not ask for a booking.
  subscription.add(
    appointments.bookState$.subscribe((state) => {
      bookPending = state.status === 'pending';
      enableBook();
      if (!bookAsked || booking!.moving) return;
      bookError.textContent = state.status === 'failure' ? failureText(state.reason) : '';
      if (state.status === 'success') book.close();
    }),
  );
  // A change, the same way, for the dialog that asked for it as a confirmation. Its success
  // only closes the dialog: the move ends because the week screen heard the result.
  subscription.add(
    appointments.changeState$.subscribe((state) => {
      changePending = state.status === 'pending';
      enableBook();
      if (!bookAsked || !booking!.moving) return;
      bookError.textContent = state.status === 'failure' ? failureText(state.reason, 'change') : '';
      if (state.status === 'success') book.close();
    }),
  );
  // A cancellation, the same way; its button is disabled while the one under way is of the
  // appointment shown.
  subscription.add(
    appointments.cancelState$.subscribe((state) => {
      cancelling = state.status === 'pending' ? state.appointmentId : null;
      enableDetail();
      if (!cancelAsked) return;
      detailError.textContent = state.status === 'failure' ? failureText(state.reason) : '';
      if (state.status === 'success') detail.close();
    }),
  );
  // A note saved, the same way, in the same dialog.
  subscription.add(
    appointments.updateNoteState$.subscribe((state) => {
      saving = state.status === 'pending' ? state.appointmentId : null;
      enableDetail();
      if (!noteAsked) return;
      detailError.textContent = state.status === 'failure' ? failureText(state.reason) : '';
      if (state.status === 'success') detail.close();
    }),
  );
  // The list of Users, for the book dialog that asked for it: the picker's choices are rebuilt
  // when a list arrives, which is at opening, before anything can be chosen.
  subscription.add(
    users.listUsersState$.subscribe((state) => {
      if (booking === null || booking.moving) return;
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

    banner.hidden = true;

    bookForm.reset();
    noteForm.reset();
    bookMode(false);
    for (const list of [bookUser, bookStart, bookEnd]) list.replaceChildren();
    for (const text of [bannerWhat, bookWhat, bookOld, bookUsersMessage, bookError, detailError]) text.textContent = '';
    for (const [, element] of detailTexts) element.textContent = '';
    bookChoices.hidden = true;
    noteForm.hidden = true;
    noted.hidden = false;
    for (const button of [detailChange, detailCancel]) button.hidden = true;
    for (const button of [bookSubmit, detailCancel, noteSave]) button.disabled = false;
  });
  return subscription;
}
