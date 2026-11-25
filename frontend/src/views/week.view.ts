import type { Role } from '@shared-calendar/shared';
import type { Subscription } from 'rxjs';
import type { Moving } from '../logic/appointment.detail';
import type { MailScreen } from '../logic/mail.screen';
import { bookingFor, bookingText, changeFor, timeChoice, userChoice, type Asked } from '../logic/booking';
import type { AppointmentBlock, BusyBlock, DayModel, GroupBlock, Placed, SlotBlock, WeekModel, WindowBlock } from '../logic/week.model';
import type { WeekScreen } from '../logic/week.screen';
import { LAST_TIME } from '../logic/times';
import type { AppointmentsService } from '../services/appointments.service';
import type { UsersService } from '../services/users.service';
import { mountDetail } from './detail.view';
import { startSetsEnd, timeLists } from './time.parts';

// What the week view uses: of the WeekScreen its stream, the three changes of week, the detail
// of an appointment, the start and the end of an appointment's move to another time, and what
// the book dialog says about a refusal; of the
// AppointmentsService the four writes, each with its state; of the UsersService the list of
// Users, which only the Administrator's book dialog asks for; the mail's screen, for the
// "E-mail…" dialog, with the week's dates it proposes; and the role, for which parts of the book
// dialog to show.
export type WeekDeps = {
  screen: Pick<WeekScreen, 'week$' | 'previous' | 'next' | 'today' | 'detail' | 'move' | 'keep' | 'refusal' | 'range'>;
  appointments: Pick<
    AppointmentsService,
    'book' | 'bookState$' | 'cancel' | 'cancelState$' | 'change' | 'changeState$' | 'updateNote' | 'updateNoteState$'
  >;
  users: Pick<UsersService, 'listUsers' | 'listUsersState$'>;
  mail: Pick<MailScreen, 'mail$' | 'send' | 'reset'>;
  role: Role;
};

// The week view (docs/FRONTEND_ARCHITECTURE.md sections 3 and 4): wires the element #week of
// index.html. It draws what the logic layer hands over ready (places, times and names as text),
// forwards three buttons, and opens three dialogs: a slot opens the book dialog, which is the
// week's own, an appointment its detail, the frame's dialog, which this view mounts while the
// week is on show (src/views/detail.view.ts) and whose "Change" starts the appointment's move
// to another time, and the Administrator's block of four or more appointments the list of them,
// the week's own too, whose rows open their detail. While an appointment is being moved a
// banner says so, and a slot opens the book dialog in its second mode, as the confirmation of
// the change. "E-mail…" opens the mail's dialog, for both roles.
export function mountWeek(root: HTMLElement, { screen, appointments, users, mail, role }: WeekDeps): Subscription {
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
  const bookError = find('dialog.book .error');
  const bookSubmit = find<HTMLButtonElement>('dialog.book .submit');
  const anyway = find('dialog.book .anyway');
  const force = find<HTMLButtonElement>('dialog.book .force');

  const group = find<HTMLDialogElement>('dialog.group');
  const groupWhat = find('dialog.group .what');
  const groupWhen = find('dialog.group .when');
  const groupPeople = find('dialog.group .people');

  const mailDialog = find<HTMLDialogElement>('dialog.mail');
  const mailForm = find<HTMLFormElement>('dialog.mail form');
  const mailWhat = find('dialog.mail .mail-what');
  const mailFrom = find<HTMLInputElement>('dialog.mail [name="from"]');
  const mailTo = find<HTMLInputElement>('dialog.mail [name="to"]');
  const mailSent = find('dialog.mail .mail-sent');
  const mailError = find('dialog.mail .error');
  const mailSubmit = find<HTMLButtonElement>('dialog.mail .submit');

  // The appointment detail is the frame's dialog, outside this view's element: mounted here for
  // as long as the week is on show. It asks the week screen for an appointment's detail, and
  // its "Change" tells the week screen, which holds the move from then on: the banner comes
  // from its stream.
  const detail = mountDetail(root.ownerDocument.querySelector<HTMLDialogElement>('#detail')!, {
    detail: (appointmentId) => screen.detail(appointmentId),
    appointments,
    change: (appointmentId) => screen.move(appointmentId),
  });

  // 2. Pure view state (docs/FRONTEND_ARCHITECTURE.md section 3, rule 10): what the open book
  // dialog is about, and whether its action was asked for since it opened. A result is shown
  // only when this opening asked for it: the state streams keep their last value, which may
  // belong to an earlier opening.
  // The appointment being moved, as the week screen last said it: the logic layer holds it, the
  // view only remembers what the stream brought, to know what a click on a slot opens.
  let moving: Moving | null = null;
  // null while the book dialog is closed. `moving` is the appointment the dialog moves to the
  // slot, in its second mode; null when it books the slot.
  let booking: { slot: SlotBlock; zone: string; moving: Moving | null } | null = null;
  // What this opening last sent, by "Book" or "Change", whichever the dialog's mode has, or by
  // "Book anyway"; null until it sent something.
  let asked: Asked | null = null;
  let bookPending = false;
  let changePending = false;
  let usersReady = false; // the Administrator has a User to choose

  // The confirmation of a change waits for a change under way only: it asks for no User.
  const enableBook = () => {
    bookSubmit.disabled = booking?.moving ? changePending : bookPending || (role === 'admin' && !usersReady);
    force.disabled = booking?.moving ? changePending : bookPending;
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
  // A full slot, the Administrator's only, is drawn apart and opens the book dialog all the same.
  // A slot that appointments overlap is a narrow tab beside them, which shows its short text; a
  // screen reader is told its time and its places in full all the same.
  const slotFor = (block: SlotBlock, timeZone: string) => {
    const element = place('tpl-slot', block, block.colour);
    element.querySelector('.time')!.textContent = block.time;
    element.querySelector('.places')!.textContent = block.tab ?? block.places;
    element.classList.toggle('full', block.full);
    element.classList.toggle('tab', block.tab !== null);
    element.setAttribute('aria-label', `${block.day} ${block.time} ${block.places}`);
    element.onclick = () => openBook(block, timeZone);
    return element;
  };
  // A screen reader is told the whole time, also when the block shows its start alone.
  const appointmentFor = (block: AppointmentBlock, dayLabel: string) => {
    const element = place('tpl-appointment', block, block.colour);
    element.querySelector('.time')!.textContent = block.shown;
    element.setAttribute('aria-label', [dayLabel, block.time, block.who, block.note].filter((text) => text !== '').join(' '));
    element.querySelector('.who')!.textContent = block.who;
    element.querySelector('.note')!.textContent = block.note;
    element.classList.toggle('beside', block.beside);
    element.classList.toggle('short', block.short);
    element.onclick = () => detail.open(block.appointmentId);
    return element;
  };
  const groupFor = (block: GroupBlock) => {
    const element = place('tpl-group', block, block.colour);
    element.querySelector('.time')!.textContent = block.time;
    element.querySelector('.what')!.textContent = block.what;
    element.classList.toggle('beside', block.beside);
    element.onclick = () => openGroup(block);
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
      ...day.appointments.map((block) => appointmentFor(block, day.label)),
      ...day.groups.map(groupFor),
    );
    // A group shows its time, and its day is the column it stands in: a screen reader, which
    // reaches a button without its column, is told the day first. A slot and an appointment have
    // their names already.
    for (const button of body.querySelectorAll('button:not([aria-label])')) button.setAttribute('aria-label', `${day.label} ${button.textContent.trim()}`);
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

  // 4. The book dialog. Opening it is a pure view action; at every opening it shows nothing of
  // the time before: the form is reset and the failure emptied.
  // The choices of a list of the book dialog: one <option> per text.
  const option = (text: string) => itemFor('tpl-option', text);
  const choices = (select: HTMLElement, texts: readonly string[]) => select.replaceChildren(...texts.map(option));
  // The Administrator's two times, an hour and a minute each. A start chosen by the person sets
  // the end one hour later, never past `last`, the end of the window that holds the slot of the
  // opening.
  const bookStart = timeLists(bookForm, 'start', option);
  const bookEnd = timeLists(bookForm, 'end', option);
  let last = LAST_TIME;
  startSetsEnd(bookStart, bookEnd, () => last);

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
    anyway.hidden = true;
    booking = { slot, zone: timeZone, moving };
    asked = null;
    bookMode(moving !== null);
    bookWhat.textContent = bookingText(slot);
    // What a change adds: the time the appointment is moved from, and its note in the field.
    bookOld.textContent = moving?.when ?? '';
    bookNote.value = moving?.note ?? '';
    if (role === 'admin') {
      // The hours the Administrator may choose, those the slot's window touches, and the two
      // times set to the slot's own, as they are: set by the script, they set nothing else.
      const times = timeChoice(slot, timeZone);
      bookStart.offer(times.starts);
      bookEnd.offer(times.ends);
      bookStart.write(times.start);
      bookEnd.write(times.end);
      last = times.last;
    }
    // Open before the list is asked for: its states are applied only while the dialog is open.
    book.showModal();
    if (role === 'admin' && moving === null) {
      // The Users, asked for at every opening of a booking: the list's states arrive through
      // its stream. A change asks for none: the User is the old appointment's.
      usersReady = false;
      users.listUsers();
    }
    enableBook();
  };
  // The list of a group: its rows are drawn at every opening, from the block pressed. A row
  // closes the list and opens its appointment's detail.
  const openGroup = (block: GroupBlock) => {
    groupWhat.textContent = block.what;
    groupWhen.textContent = block.when;
    groupPeople.replaceChildren(
      ...block.rows.map((row) => {
        const item = copy('tpl-person');
        item.querySelector('.time')!.textContent = row.time;
        item.querySelector('.who')!.textContent = row.who;
        item.querySelector<HTMLElement>('.person')!.onclick = () => {
          group.close();
          detail.open(row.appointmentId);
        };
        return item;
      }),
    );
    group.showModal();
  };
  // Nothing is done when either closes, by "Close", by the Escape key or after a success: what it
  // was about is replaced at the next opening. A browser sends the close event a moment after
  // the close, which can be after the dialog was opened again: a handler that forgot would
  // then forget the new opening.

  // 5. The user's actions become calls. "Book" and "Change" in the confirmation only call the
  // service, and the banner's button the week screen: what follows on screen comes from the
  // streams.
  find('.previous').onclick = () => screen.previous();
  find('.today').onclick = () => screen.today();
  find('.next').onclick = () => screen.next();
  find('dialog.book .close').onclick = () => book.close();
  find('dialog.group .close').onclick = () => group.close();
  // Sends what was asked: the change of the appointment being moved, or the booking; over the
  // capacity when `overbook`.
  const send = (sent: Asked, overbook: boolean) => {
    asked = sent;
    const { slot, zone: timeZone, fields, moving: moved } = sent;
    if (moved) appointments.change(moved.appointmentId, changeFor(slot, timeZone, role, fields, overbook));
    else appointments.book(bookingFor(slot, timeZone, role, fields, overbook));
  };
  // Without preventDefault the browser would send the form itself and load the page again.
  bookForm.onsubmit = (event) => {
    event.preventDefault();
    const data = new FormData(bookForm);
    const field = (name: string) => String(data.get(name) ?? '');
    send({ ...booking!, fields: { note: field('note'), username: field('username'), start: bookStart.read(), end: bookEnd.read() } }, false);
  };
  // "Book anyway" sends the request that was refused again, over the capacity. It is offered for
  // that request only: anything changed in the dialog hides it.
  force.onclick = () => send(asked!, true);
  bookForm.oninput = bookForm.onchange = () => {
    anyway.hidden = true;
  };
  find('.keep').onclick = () => screen.keep();
  // The mail's dialog opens with nothing of the time before, here or in the mail's screen, and
  // proposes the dates of the week on show; "Send" hands the two dates to the mail's screen,
  // which checks them through the service.
  find('.mail-open').onclick = () => {
    mailForm.reset();
    mail.reset();
    const { from, to } = screen.range();
    mailFrom.value = from;
    mailTo.value = to;
    mailDialog.showModal();
  };
  find('dialog.mail .close').onclick = () => mailDialog.close();
  mailForm.onsubmit = (event) => {
    event.preventDefault();
    mail.send(mailFrom.value, mailTo.value);
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
  // What a refusal says in the dialog, in the words the week screen chooses, with "Book anyway"
  // when it offers it; nothing of an earlier answer while another one is awaited.
  const answered = (state: { status: string; reason?: string }) => {
    const refusal = state.status === 'failure' ? screen.refusal(state.reason!, asked!) : null;
    bookError.textContent = refusal?.text ?? '';
    anyway.hidden = refusal?.offer !== true;
    if (state.status === 'success') book.close();
  };
  // A booking: "Book" is disabled while one is under way; the dialog that asked for it closes
  // on its success and shows its failure in plain words, staying open with what was typed. The
  // confirmation of a change is the same dialog and did not ask for a booking.
  subscription.add(
    appointments.bookState$.subscribe((state) => {
      bookPending = state.status === 'pending';
      enableBook();
      if (asked === null || booking!.moving) return;
      answered(state);
    }),
  );
  // A change, the same way, for the dialog that asked for it as a confirmation. Its success
  // only closes the dialog: the move ends because the week screen heard the result.
  subscription.add(
    appointments.changeState$.subscribe((state) => {
      changePending = state.status === 'pending';
      enableBook();
      if (asked === null || !booking!.moving) return;
      answered(state);
    }),
  );
  // The list of Users, for the book dialog that asked for it: the picker's choices are rebuilt
  // when a list arrives, which is at opening, before anything can be chosen.
  subscription.add(
    users.listUsersState$.subscribe((state) => {
      if (!book.open || booking!.moving) return;
      const choice = userChoice(state);
      choices(bookUser, choice.usernames);
      bookUsersMessage.textContent = choice.message;
      usersReady = choice.ready;
      enableBook();
    }),
  );
  // The mail's dialog: what the mail holds, where it went or why not; "Send" disabled while one
  // is under way. The mail's screen forgets at every opening, so what is shown is this opening's.
  subscription.add(
    mail.mail$.subscribe((state) => {
      mailWhat.textContent = state.what;
      mailSent.textContent = state.sent ?? '';
      mailError.textContent = state.failure ?? '';
      mailSubmit.disabled = state.sending;
    }),
  );
  // The parts of the book dialog that are the Administrator's.
  bookChoices.hidden = role !== 'admin';

  // 7. Leaving the view: the element stays in the page, only hidden, so one person's week,
  // notes and names are removed before the next person signs in
  // (docs/FRONTEND_ARCHITECTURE.md section 3, rule 9). The detail ends with the view, and
  // cleans up after itself.
  subscription.add(detail.subscription);
  subscription.add(() => {
    book.close();
    group.close();
    mailDialog.close();
    draw(null);
    label.textContent = '';
    loading.hidden = true;
    week.classList.remove('stale');
    failure.hidden = true;
    failure.textContent = '';

    banner.hidden = true;

    bookForm.reset();
    bookMode(false);
    anyway.hidden = true;
    for (const list of [bookUser, ...bookStart.lists, ...bookEnd.lists, groupPeople]) list.replaceChildren();
    for (const text of [bannerWhat, bookWhat, bookOld, bookUsersMessage, bookError, groupWhat, groupWhen, mailWhat, mailSent, mailError]) text.textContent = '';
    bookChoices.hidden = true;
    mailForm.reset();
    bookSubmit.disabled = force.disabled = mailSubmit.disabled = false;
  });
  return subscription;
}
