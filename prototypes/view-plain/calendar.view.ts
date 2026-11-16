import type { Subscription } from 'rxjs';
import type { CalendarDeps } from '../common/app';
import { bookingFor, explain, type AppointmentBlock, type DayModel, type Placed, type SlotBlock, type WeekModel, type WindowBlock } from '../common/logic';

// The calendar view, plain: the markup is the section #calendar of index.html, its dialogs and
// its <template> elements included. This function finds the elements, fills them at every
// notification and turns the user's actions into calls.
export function mountCalendar(root: HTMLElement, deps: CalendarDeps): Subscription {
  const { session, screen, appointments, users } = deps;

  // ── The elements ───────────────────────────────────────────────────────────────────────────
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  // A copy of the element inside a <template>.
  const copy = <T extends HTMLElement = HTMLElement>(id: string) =>
    find<HTMLTemplateElement>(`#${id}`).content.firstElementChild!.cloneNode(true) as T;

  const loading = find('.loading');
  const weekError = find('.week-error');
  const weekLabel = find('.week-label');
  const zone = find('.zone');
  const legend = find('.legend');
  const week = find('.week');
  const hours = find('.hours');
  const days = find('.days');

  const bookDialog = find<HTMLDialogElement>('dialog.book');
  const bookForm = find<HTMLFormElement>('dialog.book form');
  const bookWhat = find('dialog.book .what');
  const bookUser = find<HTMLSelectElement>('dialog.book select');
  const bookError = find('dialog.book .error');
  const bookSubmit = find<HTMLButtonElement>('dialog.book .submit');

  const detailDialog = find<HTMLDialogElement>('dialog.detail');
  const detailWhen = find('dialog.detail .when');
  const detailType = find('dialog.detail .type');
  const detailWho = find('dialog.detail .who');
  const detailNote = find('dialog.detail .note');
  const detailHint = find('dialog.detail .hint');
  const detailError = find('dialog.detail .error');
  const detailCancel = find<HTMLButtonElement>('dialog.detail .cancel');

  // ── Pure view state: what the open dialog is about ─────────────────────────────────────────
  let booking: SlotBlock | undefined;
  let shown: AppointmentBlock | undefined;

  const openBook = (slot: SlotBlock) => {
    booking = slot;
    bookForm.reset();
    bookWhat.textContent = `${slot.day}, ${slot.time} · ${slot.typeName}`;
    bookError.textContent = '';
    bookDialog.showModal();
  };
  const openDetail = (appointment: AppointmentBlock) => {
    shown = appointment;
    detailWhen.textContent = `${appointment.day}, ${appointment.time}`;
    detailType.textContent = appointment.typeName;
    detailWho.textContent = appointment.who;
    detailNote.textContent = appointment.note === '' ? '—' : appointment.note;
    detailHint.textContent = appointment.cancelHint;
    detailCancel.hidden = !appointment.canCancel;
    detailError.textContent = '';
    detailDialog.showModal();
  };

  // ── Drawing a week: copies of the templates, filled with textContent ───────────────────────
  const place = <T extends HTMLElement>(element: T, block: Placed): T => {
    element.style.top = block.top;
    element.style.height = block.height;
    return element;
  };
  const windowFor = (block: WindowBlock) => {
    const element = place(copy('tpl-window'), block);
    element.classList.add(`type-${block.colour}`);
    element.textContent = block.typeName;
    return element;
  };
  const busyFor = (block: Placed) => {
    const element = place(copy('tpl-busy'), block);
    element.querySelector('.time')!.textContent = block.time;
    return element;
  };
  const slotFor = (block: SlotBlock) => {
    const element = place(copy<HTMLButtonElement>('tpl-slot'), block);
    element.classList.add(`type-${block.colour}`);
    element.title = `Book ${block.typeName}, ${block.time}`;
    element.querySelector('.time')!.textContent = block.time;
    element.onclick = () => openBook(block);
    return element;
  };
  const appointmentFor = (block: AppointmentBlock) => {
    const element = place(copy<HTMLButtonElement>('tpl-appointment'), block);
    element.classList.add(`type-${block.colour}`);
    element.querySelector('.time')!.textContent = block.time;
    element.querySelector('.who')!.textContent = block.who;
    element.querySelector('.note')!.textContent = block.note;
    element.onclick = () => openDetail(block);
    return element;
  };
  const dayFor = (day: DayModel) => {
    const element = copy('tpl-day');
    element.classList.toggle('today', day.today);
    element.querySelector('h3')!.textContent = day.label;
    element
      .querySelector('.day-body')!
      .append(...day.windows.map(windowFor), ...day.busy.map(busyFor), ...day.slots.map(slotFor), ...day.appointments.map(appointmentFor));
    return element;
  };
  const item = (text: string, className = '') => {
    const element = document.createElement('li');
    element.className = className;
    element.textContent = text;
    return element;
  };

  let drawn: WeekModel | null = null;
  const draw = (model: WeekModel | null) => {
    drawn = model;
    zone.textContent = model === null ? '' : `Times are in the calendar's time zone, ${model.timeZone}.`;
    week.style.setProperty('--hours', String(model?.hours.length ?? 0));
    legend.replaceChildren(...(model?.types ?? []).map((type) => item(type.name, `type-${type.colour}`)));
    hours.replaceChildren(...(model?.hours ?? []).map((hour) => item(hour)));
    days.replaceChildren(...(model?.days ?? []).map(dayFor));
  };

  // ── What never changes during the session ──────────────────────────────────────────────────
  find('.bar .who').textContent = `${session.username} (${session.role === 'admin' ? 'Administrator' : 'User'})`;
  find('.for-user').hidden = session.role !== 'admin';

  // ── The user's actions ─────────────────────────────────────────────────────────────────────
  find('.sign-out').onclick = () => deps.signOut();
  find('.previous').onclick = () => screen.previous();
  find('.today').onclick = () => screen.today();
  find('.next').onclick = () => screen.next();
  for (const button of root.querySelectorAll<HTMLButtonElement>('dialog .close')) {
    button.onclick = () => button.closest('dialog')!.close();
  }
  bookForm.onsubmit = (event) => {
    event.preventDefault();
    if (booking === undefined) return;
    const data = new FormData(bookForm);
    appointments.book(bookingFor(booking, String(data.get('note') ?? ''), String(data.get('username') ?? '')));
  };
  detailCancel.onclick = () => {
    if (shown !== undefined) appointments.cancel(shown.appointmentId);
  };

  // ── The streams ────────────────────────────────────────────────────────────────────────────
  const subscription = screen.week$.subscribe((state) => {
    weekLabel.textContent = state.label;
    loading.hidden = !state.loading;
    week.classList.toggle('stale', state.loading);
    weekError.hidden = state.error === null;
    weekError.textContent = state.error ?? '';
    if (state.week !== drawn) draw(state.week); // the week is rebuilt only when it is another one
  });

  subscription.add(
    users.listUsersState$.subscribe((state) => {
      const names = state.status === 'success' ? state.users.map((user) => user.username) : [];
      bookUser.replaceChildren(
        ...names.map((name) => {
          const option = document.createElement('option');
          option.textContent = name;
          return option;
        }),
      );
    }),
  );

  subscription.add(
    appointments.bookState$.subscribe((state) => {
      bookSubmit.disabled = state.status === 'pending';
      bookError.textContent = state.status === 'failure' ? explain(state) : '';
      if (state.status === 'success') bookDialog.close();
    }),
  );

  subscription.add(
    appointments.cancelState$.subscribe((state) => {
      detailCancel.disabled = state.status === 'pending';
      detailError.textContent = state.status === 'failure' ? explain(state) : '';
      if (state.status === 'success') detailDialog.close();
    }),
  );

  // Leaving the view: the section stays in the page, so it is emptied by hand, and the next
  // person to sign in does not see this one's week.
  subscription.add(() => {
    bookDialog.close();
    detailDialog.close();
    draw(null);
  });
  return subscription;
}
