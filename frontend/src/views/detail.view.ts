import type { Subscription } from 'rxjs';
import type { AppointmentDetail } from '../logic/appointment.detail';
import { failureText } from '../logic/texts';
import type { AppointmentsService } from '../services/appointments.service';
import { PAGE_TEXTS_EN } from '../texts/texts.en';

// What the detail dialog uses, handed over by the screen's view that mounts it: how that screen
// answers the detail of one of its appointments by its id; of the AppointmentsService the two
// writes the dialog makes itself, each with its state; and what "Change" does on that screen.
export type DetailDeps = {
  detail: (appointmentId: string) => AppointmentDetail | null;
  appointments: Pick<AppointmentsService, 'cancel' | 'cancelState$' | 'updateNote' | 'updateNoteState$'>;
  change: (appointmentId: string) => void;
};

// What the view that mounted the dialog gets back: the subscription, which it ends with its
// own, and `open`, which it calls when one of its appointments is clicked.
export type DetailView = { subscription: Subscription; open: (appointmentId: string) => void };

// The texts of the detail dialog: each is a field of the AppointmentDetail and the class of its
// element.
const DETAIL_TEXTS = ['when', 'typeName', 'who', 'note', 'booked', 'hint'] as const;

// The appointment detail (docs/FRONTEND_ARCHITECTURE.md section 4): wires the dialog #detail of
// index.html, which belongs to no screen. The view of the screen on show mounts it, so it is
// mounted once at a time. It shows what the logic layer hands over ready, saves the note,
// cancels the appointment, and forwards "Change" to the screen that mounted it.
export function mountDetail(root: HTMLDialogElement, { detail, appointments, change }: DetailDeps): DetailView {
  // 1. Find the elements, once.
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const texts = DETAIL_TEXTS.map((field) => [field, find(`.${field}`)] as const);
  const error = find('.error');
  const changeButton = find<HTMLButtonElement>('.change');
  const cancelButton = find<HTMLButtonElement>('.cancel');
  const noted = find('.noted');
  const noteForm = find<HTMLFormElement>('.note-form');
  const noteField = find<HTMLTextAreaElement>('[name="note"]');
  const noteSave = find<HTMLButtonElement>('.note-form .submit');

  // 2. Pure view state (docs/FRONTEND_ARCHITECTURE.md section 3, rule 10): which appointment
  // the open dialog is about, and whether each of its two actions was asked for since it
  // opened. A result is shown only when this opening asked for it: the state streams keep their
  // last value, which may belong to an earlier opening.
  let shown: string | null = null;
  let cancelAsked = false;
  let cancelling: string | null = null; // the appointment whose cancellation is under way
  let noteAsked = false;
  let saving: string | null = null; // the appointment whose note is being saved

  const enable = () => {
    cancelButton.disabled = cancelling !== null && cancelling === shown;
    noteSave.disabled = saving !== null && saving === shown;
  };

  // 3. Opening is a pure view action; at every opening the dialog shows nothing of the time
  // before.
  const open = (appointmentId: string) => {
    const found = detail(appointmentId);
    if (found === null) return; // the screen no longer holds it
    shown = appointmentId;
    cancelAsked = false;
    noteAsked = false;
    for (const [field, element] of texts) element.textContent = found[field];
    // The note: a field while it can be edited, the text to read otherwise.
    noteField.value = found.noteValue;
    noteForm.hidden = !found.canEditNote;
    noted.hidden = found.canEditNote;
    error.textContent = '';
    changeButton.hidden = !found.canChange;
    cancelButton.hidden = !found.canCancel;
    enable();
    root.showModal();
  };
  // Nothing is done when it closes, by "Close", by the Escape key or after a success: which
  // appointment it was about is replaced at the next opening. A browser sends the close event
  // a moment after the close, which can be after the dialog was opened again: a handler that
  // forgot would then forget the new opening.

  // 4. The user's actions become calls: what follows on screen comes from the streams.
  find('.close').onclick = () => root.close();
  // The note is sent as the field holds it: the shared schema, through the service, trims it
  // and makes a blank one null, which clears it. Without preventDefault the browser would send
  // the form itself and load the page again.
  noteForm.onsubmit = (event) => {
    event.preventDefault();
    noteAsked = true;
    appointments.updateNote(shown!, noteField.value);
  };
  // "Change" closes the dialog, a pure view action, and tells the screen that mounted it.
  changeButton.onclick = () => {
    const appointmentId = shown!;
    root.close();
    change(appointmentId);
  };
  cancelButton.onclick = () => {
    cancelAsked = true;
    appointments.cancel(shown!);
  };

  // 5. The streams' notifications. A cancellation: its button is disabled while the one under
  // way is of the appointment shown; the dialog that asked for it closes on its success and
  // shows its failure in plain words, staying open.
  const subscription = appointments.cancelState$.subscribe((state) => {
    cancelling = state.status === 'pending' ? state.appointmentId : null;
    enable();
    if (!cancelAsked) return;
    error.textContent = state.status === 'failure' ? failureText(PAGE_TEXTS_EN.failures, state.reason) : '';
    if (state.status === 'success') root.close();
  });
  // A note saved, the same way.
  subscription.add(
    appointments.updateNoteState$.subscribe((state) => {
      saving = state.status === 'pending' ? state.appointmentId : null;
      enable();
      if (!noteAsked) return;
      error.textContent = state.status === 'failure' ? failureText(PAGE_TEXTS_EN.failures, state.reason) : '';
      if (state.status === 'success') root.close();
    }),
  );

  // 6. Leaving: the dialog stays in the page, so one person's appointment and note are removed
  // before the next screen, or the next person, opens it
  // (docs/FRONTEND_ARCHITECTURE.md section 3, rule 9).
  subscription.add(() => {
    root.close();
    noteForm.reset();
    for (const [, element] of texts) element.textContent = '';
    error.textContent = '';
    noteForm.hidden = true;
    noted.hidden = false;
    for (const button of [changeButton, cancelButton]) button.hidden = true;
    for (const button of [cancelButton, noteSave]) button.disabled = false;
  });
  return { subscription, open };
}
