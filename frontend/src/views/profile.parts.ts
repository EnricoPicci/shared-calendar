import type { EditState } from '../logic/users.screen';
import { FACTS, type ProfileFields, type ProfileRefusals } from '../logic/profile.model';

// The four fields of a person's facts (docs/EMAIL_ARCHITECTURE.md section 4.1), which the users
// screen's create form and the Edit dialogs of the users screen and of "My details" hold the same
// way: one `.field` per fact, its input (a textarea for the address) and its refusal.

const FIELD_CLASS: Record<keyof ProfileFields, string> = {
  givenName: '.given-name-field',
  familyName: '.family-name-field',
  email: '.email-field',
  address: '.address-field',
};

/** The four fields inside `container`: read, filled, marked refused, emptied. */
export type ProfileForm = {
  read: () => ProfileFields;
  fill: (fields: ProfileFields) => void;
  refuse: (refusals: ProfileRefusals) => void;
  clear: () => void;
};

export function profileForm(container: HTMLElement): ProfileForm {
  const parts = FACTS.map((fact) => {
    const field = container.querySelector<HTMLElement>(FIELD_CLASS[fact])!;
    return { fact, input: field.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')!, refusal: field.querySelector('.refusal')! };
  });
  return {
    read: () => Object.fromEntries(parts.map(({ fact, input }) => [fact, input.value])) as ProfileFields,
    fill: (fields) => {
      for (const { fact, input } of parts) input.value = fields[fact];
    },
    // A field in fault: marked for a screen reader and for the style sheet, its sentence under it.
    refuse: (refusals) => {
      for (const { fact, input, refusal } of parts) {
        refusal.textContent = refusals[fact] ?? '';
        if (refusals[fact] === null) input.removeAttribute('aria-invalid');
        else input.setAttribute('aria-invalid', 'true');
      }
    },
    clear: () => {
      for (const { input, refusal } of parts) {
        input.value = '';
        input.removeAttribute('aria-invalid');
        refusal.textContent = '';
      }
    },
  };
}

/** What an Edit dialog does at the person's actions. */
export type EditActions = { opened: () => void; typed: (fields: ProfileFields) => void; save: (fields: ProfileFields) => void };

/** An Edit dialog: opened with the facts to change, showing the state of its save. */
export type EditDialog = { open: (fields: ProfileFields) => void; show: (edit: EditState) => void; clear: () => void };

// The Edit dialog of the four facts (docs/FRONTEND_ARCHITECTURE.md section 4: a dialog with a
// form). Opening it fills the fields and asks the logic layer to start clean; "Cancel" closes it,
// as the Escape key does; it closes by itself when a save asked for since it opened succeeded.
// Nothing is done when it closes: what it held is replaced at the next opening.
export function editDialog(dialog: HTMLDialogElement, actions: EditActions): EditDialog {
  const form = dialog.querySelector<HTMLFormElement>('form.profile')!;
  const fields = profileForm(form);
  const failure = form.querySelector('.failure')!;
  const submit = form.querySelector<HTMLButtonElement>('.submit')!;
  // The save results this opening may hear: only an object other than the one on show when it
  // opened, so that an earlier opening's success does not close it.
  let before: object | null = null;
  let current: EditState | null = null;

  form.querySelector<HTMLButtonElement>('.cancel')!.onclick = () => dialog.close();
  form.oninput = () => actions.typed(fields.read());
  // Without preventDefault the browser would send the form itself and load the page again.
  form.onsubmit = (event) => {
    event.preventDefault();
    actions.save(fields.read());
  };

  return {
    open: (values) => {
      before = current?.saved ?? null;
      fields.clear();
      fields.fill(values);
      failure.textContent = '';
      actions.opened();
      dialog.showModal();
    },
    show: (edit) => {
      current = edit;
      fields.refuse(edit.refusals);
      failure.textContent = edit.failure ?? '';
      submit.disabled = edit.saving;
      if (dialog.open && edit.saved !== null && edit.saved !== before) {
        before = edit.saved;
        dialog.close();
      }
    },
    clear: () => {
      dialog.close();
      fields.clear();
      failure.textContent = '';
      submit.disabled = false;
      before = null;
      current = null;
    },
  };
}
