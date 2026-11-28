import type { Subscription } from 'rxjs';
import type { AppointmentRow } from '../logic/appointments.model';
import type { AppointmentsScreen } from '../logic/appointments.screen';
import { mountDetail, type DetailDeps } from './detail.view';

// What the view of "My appointments" uses: of the AppointmentsScreen its stream, the two modes,
// the period of the history, the detail of an appointment and its hand-over to the week; of the
// AppointmentsService what the detail dialog uses; and a function that shows the week, which
// the shell hands over: this view does not know the week's address.
export type AppointmentsDeps = {
  screen: Pick<AppointmentsScreen, 'list$' | 'upcoming' | 'history' | 'show' | 'detail' | 'move'>;
  appointments: DetailDeps['appointments'];
  showWeek: () => void;
  // The page texts of the language in use, for the detail dialog.
  texts: DetailDeps['texts'];
};

// The view of "My appointments" (docs/FRONTEND_ARCHITECTURE.md sections 3 and 4): wires the
// element #appointments of index.html. It draws the rows the logic layer hands over ready,
// forwards the two modes and the period's form, and opens the detail dialog on a row.
export function mountAppointments(root: HTMLElement, { screen, appointments, showWeek, texts }: AppointmentsDeps): Subscription {
  // 1. Find the elements, once.
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const upcoming = find('.upcoming');
  const history = find('.history');
  const loading = find('.loading');
  const period = find<HTMLFormElement>('.period');
  const from = find<HTMLInputElement>('[name="from"]');
  const to = find<HTMLInputElement>('[name="to"]');
  const refusal = find('.refusal');
  const failure = find('.failure');
  const empty = find('.empty');
  const list = find('.list');
  const rowTemplate = find<HTMLTemplateElement>('#tpl-appointment-row');

  // The appointment detail is the frame's dialog, outside this view's element: mounted here for
  // as long as the list is on show. It asks the list screen for an appointment's detail.
  // "Change" hands the appointment over to the week screen, through the list screen, and shows
  // the week, where the new time is chosen: the one change of address a view asks for.
  const detail = mountDetail(root.ownerDocument.querySelector<HTMLDialogElement>('#detail')!, {
    detail: (appointmentId) => screen.detail(appointmentId),
    appointments,
    change: (appointmentId) => {
      screen.move(appointmentId);
      showWeek();
    },
    texts,
  });

  // 2. Drawing the list: one copy of the template per row, filled with textContent. The row is
  // a button: a click only opens the detail.
  const rowFor = (row: AppointmentRow) => {
    const item = rowTemplate.content.firstElementChild!.cloneNode(true) as HTMLElement;
    const button = item.querySelector<HTMLElement>('.row')!;
    button.classList.add(`is-${row.kind}`);
    button.querySelector('.date')!.textContent = row.date;
    button.querySelector('.time')!.textContent = row.time;
    button.querySelector('.type-name')!.textContent = row.typeName;
    button.querySelector('.note')!.textContent = row.note;
    button.querySelector('.status')!.textContent = row.status;
    button.onclick = () => detail.open(row.appointmentId);
    return item;
  };
  // What is now in the page: the list is rebuilt only when the stream brings another one, and
  // the two dates are set only when it brings another period, so that a date being typed is
  // left alone by a list that arrives meanwhile.
  let drawn: readonly AppointmentRow[] | null = null;
  let filled: { from: string; to: string } | null = null;

  // 3. The user's actions become calls: what follows on screen comes from the stream.
  upcoming.onclick = () => screen.upcoming();
  history.onclick = () => screen.history();
  // Without preventDefault the browser would send the form itself and load the page again. The
  // two dates go as the fields hold them, an empty one included: the logic layer checks them.
  period.onsubmit = (event) => {
    event.preventDefault();
    screen.show(from.value, to.value);
  };

  // 4. The stream's notifications fill the elements.
  const subscription = screen.list$.subscribe((state) => {
    upcoming.setAttribute('aria-pressed', String(state.mode === 'upcoming'));
    history.setAttribute('aria-pressed', String(state.mode === 'history'));
    loading.hidden = !state.loading;
    list.classList.toggle('stale', state.loading);
    period.hidden = state.mode !== 'history';
    if (state.period !== filled) {
      filled = state.period;
      from.value = filled?.from ?? '';
      to.value = filled?.to ?? '';
    }
    refusal.textContent = state.refusal ?? '';
    failure.hidden = state.failure === null;
    failure.textContent = state.failure ?? '';
    empty.hidden = state.empty === null;
    empty.textContent = state.empty ?? '';
    if (state.rows !== drawn) {
      drawn = state.rows;
      list.replaceChildren(...(drawn ?? []).map(rowFor));
    }
  });

  // 5. Leaving the view: the element stays in the page, only hidden, so one person's
  // appointments, notes and dates are removed before the next person signs in
  // (docs/FRONTEND_ARCHITECTURE.md section 3, rule 9). The detail ends with the view, and
  // cleans up after itself.
  subscription.add(detail.subscription);
  subscription.add(() => {
    list.replaceChildren();
    list.classList.remove('stale');
    period.reset();
    period.hidden = true;
    for (const button of [upcoming, history]) button.setAttribute('aria-pressed', 'false');
    loading.hidden = true;
    failure.hidden = true;
    empty.hidden = true;
    for (const text of [refusal, failure, empty]) text.textContent = '';
  });
  return subscription;
}
