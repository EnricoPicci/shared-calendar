import { Subscription } from 'rxjs';
import type { Choice } from '../logic/availability.model';
import type { Ask } from '../logic/availability.screen';
import type { ConflictList } from '../logic/conflicts';
import { timeLists, type TimeLists } from './time.parts';

// What the two views of the availability screen share (docs/FRONTEND_ARCHITECTURE.md
// section 4): the look-up of a form whose fields are checked, the choices of a list, the
// conflicts list, and the one dialog that confirms. Each view asks for its own parts on the
// element #availability of index.html; the dialog is mounted once, by whoever shows the
// screen, and handed to both. Nothing here decides anything: values and texts of elements
// found once, and copies of a template filled with textContent.

// What a write says in a form: why a field was refused, why the call failed, and the
// appointments in the way.
export type Said = Pick<Ask<string>, 'refusals' | 'failure' | 'conflicts'>;

export function availabilityParts(root: HTMLElement) {
  // A copy of the element inside a <template> of the screen.
  const copy = (id: string) => root.querySelector<HTMLTemplateElement>(`#${id}`)!.content.firstElementChild!.cloneNode(true) as HTMLElement;

  // The choices of a list: one <option> per choice.
  const choices = (select: Element, list: readonly Choice[]) =>
    select.replaceChildren(
      ...list.map(({ value, label }) => {
        const option = copy('tpl-choice') as HTMLOptionElement;
        option.value = value;
        option.textContent = label;
        return option;
      }),
    );

  // The appointments in the way, under a failure: the sentence that counts them, then one copy
  // of the template each, filled with textContent; nothing when there is no list.
  const showConflicts = (box: HTMLElement, list: ConflictList | null) => {
    box.hidden = list === null;
    box.querySelector('.conflicts-count')!.textContent = list?.sentence ?? '';
    box.querySelector('.conflicts-list')!.replaceChildren(
      ...(list?.rows ?? []).map((row) => {
        const item = copy('tpl-conflict');
        for (const key of ['date', 'time', 'username'] as const) item.querySelector(`.${key}`)!.textContent = row[key];
        return item;
      }),
    );
  };

  // A form whose fields are checked, found once: the fields by their names, each with the
  // refusal of its .field, the failure, the conflicts list where the form has one, and the
  // button. A field with no element of its name is a time, its two lists an hour and a minute
  // (src/views/time.parts.ts); `times` holds those, by name. Towards the logic layer a time is
  // one `HH:mm` text like any other field's.
  const option = (text: string) => {
    const element = copy('tpl-choice') as HTMLOptionElement;
    element.value = element.textContent = text;
    return element;
  };
  const form = (selector: string, names: readonly string[]) => {
    const element = root.querySelector<HTMLFormElement>(selector)!;
    const times: Record<string, TimeLists> = {};
    const fields = names.map((name) => {
      const input = element.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
      const time = input === null ? (times[name] = timeLists(element, name, option)) : null;
      const inputs = time?.lists ?? [input!];
      return {
        name,
        inputs,
        read: () => time?.read() ?? input!.value,
        write: (value: string) => (time ? time.write(value) : (input!.value = value)),
        refusal: inputs[0]!.closest('.field')!.querySelector('.refusal')!,
      };
    });
    const failure = element.querySelector('.failure');
    const conflicts = element.querySelector<HTMLElement>('.conflicts');
    return {
      form: element,
      fields,
      times,
      submit: element.querySelector<HTMLButtonElement>('.submit')!,
      // What the form holds, as text.
      held: () => Object.fromEntries(fields.map(({ name, read }) => [name, read()])),
      // The form filled with given values.
      fill: (values: Record<string, string>) => {
        for (const { name, write } of fields) write(values[name]!);
      },
      // What a write says, in the form: each field in fault marked for a screen reader and for
      // the style sheet, both lists of a time alike, its sentence under it; the failure; the
      // appointments in the way. A field named with an empty sentence is marked and has no
      // words under it: the sentence of another field names it. With no outcome, nothing of
      // it: the form of a dialog that opens.
      say: (said: Said | null) => {
        for (const { name, inputs, refusal } of fields) {
          const why = said?.refusals[name];
          refusal.textContent = why ?? '';
          for (const input of inputs) {
            if (why === undefined) input.removeAttribute('aria-invalid');
            else input.setAttribute('aria-invalid', 'true');
          }
        }
        if (failure) failure.textContent = said?.failure ?? '';
        if (conflicts) showConflicts(conflicts, said?.conflicts ?? null);
      },
    };
  };

  return { copy, choices, showConflicts, form };
}

// What the action a dialog confirmed says: whether it is under way, why it failed, the
// appointments in the way, and whether it is done.
export type Confirmed = { busy: boolean; failure: string | null; conflicts: ConflictList | null; done: boolean };
// How the view that opened the dialog tells it of that action, for as long as the opening
// lasts: after the next opening, whoever made it, it tells nothing.
export type Tell = (outcome: Confirmed) => void;
export type Confirm = {
  subscription: Subscription;
  // Opens the dialog with a question. `busy` says whether an action of this kind is already
  // under way; `confirmed` is what the dialog's button does.
  open: (question: string, busy: boolean, confirmed: () => void) => Tell;
};

// The dialog that confirms (docs/FRONTEND_ARCHITECTURE.md section 4): `dialog.delete` of
// #availability, which asks before a type, a pattern, a date's own windows or an extra window
// is deleted and before a date is made not available. Two views open it, so what is local to
// it is here: which opening it is on, and whether its button was pressed since.
export function mountConfirm(root: HTMLElement): Confirm {
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(`dialog.delete ${selector}`)!;
  const dialog = root.querySelector<HTMLDialogElement>('dialog.delete')!;
  const question = find('.question');
  const error = find('.error');
  const conflicts = find('.conflicts');
  const submit = find<HTMLButtonElement>('.submit');
  const { showConflicts } = availabilityParts(root);

  // Pure view state (docs/FRONTEND_ARCHITECTURE.md section 3, rule 10): the number of the
  // opening, what its button does, and whether it was pressed. Replaced at every opening;
  // nothing is done when the dialog closes (a browser sends the close event late, perhaps
  // after the next opening).
  let opening = 0;
  let asked = false;
  let act = () => {};

  find('.keep').onclick = () => dialog.close();
  submit.onclick = () => {
    asked = true;
    act();
  };

  const open = (words: string, busy: boolean, confirmed: () => void): Tell => {
    const mine = ++opening;
    asked = false;
    act = confirmed;
    question.textContent = words;
    error.textContent = '';
    showConflicts(conflicts, null);
    submit.disabled = busy;
    dialog.showModal();
    // The button is disabled while the action is under way, asked for from here or not. A
    // failure is shown, and a success closes the dialog, only when this opening asked for
    // it: an outcome keeps its last value, which may be an earlier opening's.
    return (outcome) => {
      if (mine !== opening) return;
      submit.disabled = outcome.busy;
      if (!asked) return;
      error.textContent = outcome.failure ?? '';
      showConflicts(conflicts, outcome.conflicts);
      if (outcome.done) dialog.close();
    };
  };

  // Leaving the screen: the dialog is closed and emptied, and no opening is left to tell.
  const subscription = new Subscription(() => {
    dialog.close();
    opening += 1;
    act = () => {};
    question.textContent = error.textContent = '';
    showConflicts(conflicts, null);
    submit.disabled = false;
  });
  return { subscription, open };
}
