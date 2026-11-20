import type { Subscription } from 'rxjs';
import {
  deletePatternQuestion,
  deleteTypeQuestion,
  END_CHOICES,
  PATTERN_FIELDS,
  START_CHOICES,
  TYPE_NAME_HINT,
  WEEKDAY_CHOICES,
  type Choice,
  type PatternFields,
  type PatternGroup,
  type PatternRow,
  type TypeRow,
} from '../logic/availability.model';
import type { Ask, AskName, AvailabilityScreen } from '../logic/availability.screen';
import type { ConflictList } from '../logic/conflicts';
import { failureText } from '../logic/texts';
import type { AvailabilityRulesService } from '../services/availability-rules.service';
import type { DeletePatternState } from '../services/availability-rules.types';
import type { AvailabilityTypesService } from '../services/availability-types.service';
import type { RemoveTypeState } from '../services/availability-types.types';

// What the availability view uses: of the AvailabilityScreen its stream, the four writes it
// checks, the two new tries after a read that failed, and the appointments in the way of a
// failure made ready to draw; of the two services the two deletes with their states, for the
// dialog that confirms them.
export type AvailabilityDeps = {
  screen: Pick<AvailabilityScreen, 'availability$' | 'createType' | 'rename' | 'createPattern' | 'change' | 'retryTypes' | 'retryPatterns' | 'conflicts'>;
  types: Pick<AvailabilityTypesService, 'remove' | 'removeState$'>;
  rules: Pick<AvailabilityRulesService, 'deletePattern' | 'deletePatternState$'>;
};

// The availability view (docs/FRONTEND_ARCHITECTURE.md sections 3 and 4): wires the element
// #availability of index.html. It draws the rows the logic layer hands over, sends the fields
// of its four forms as text, shows under each field why it was refused and under a refused
// change the appointments in the way, and asks before a delete.
export function mountAvailability(root: HTMLElement, { screen, types, rules }: AvailabilityDeps): Subscription {
  // 1. Find the elements, once. The four forms have one shape: the fields, each with the
  // refusal of its .field, the failure, the appointments in the way (the two forms of a
  // pattern), and the button.
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const copy = (id: string) => find<HTMLTemplateElement>(`#${id}`).content.firstElementChild!.cloneNode(true) as HTMLElement;
  const part = (selector: string, names: readonly string[]) => {
    const form = find<HTMLFormElement>(selector);
    const fields = names.map((name) => {
      const input = form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!;
      return { name, input, refusal: input.closest('.field')!.querySelector('.refusal')! };
    });
    return { form, fields, failure: form.querySelector('.failure')!, conflicts: form.querySelector<HTMLElement>('.conflicts'), submit: form.querySelector<HTMLButtonElement>('.submit')! };
  };
  const forms: Record<AskName, ReturnType<typeof part>> = {
    typeCreate: part('form.create-type', ['name']),
    rename: part('dialog.rename form', ['name']),
    patternCreate: part('form.create-pattern', PATTERN_FIELDS),
    change: part('dialog.change form', PATTERN_FIELDS),
  };
  const loading = find('.loading');
  const lists = {
    types: { unread: find('.types .unread'), why: find('.types .unread .error'), empty: find('.types .empty'), rows: find('.types .list') },
    patterns: { unread: find('.patterns .unread'), why: find('.patterns .unread .error'), empty: find('.patterns .empty'), rows: find('.patterns .groups') },
  };
  const nameHints = [...root.querySelectorAll('.name-hint')];
  const typeHints = [...root.querySelectorAll('.type-hint')];
  const typeLists = [...root.querySelectorAll<HTMLSelectElement>('[name="typeId"]')];
  const dialogs = { rename: find<HTMLDialogElement>('dialog.rename'), change: find<HTMLDialogElement>('dialog.change') };
  const remove = find<HTMLDialogElement>('dialog.delete');
  const question = find('dialog.delete .question');
  const removeError = find('dialog.delete .error');
  const removeConflicts = find('dialog.delete .conflicts');
  const removeSubmit = find<HTMLButtonElement>('dialog.delete .submit');

  // The choices of a list: one <option> per choice. Those of the weekday and of the two times
  // never change; those of the type follow the stream. What a name is stands under its field.
  const choices = (select: Element, list: readonly Choice[]) =>
    select.replaceChildren(
      ...list.map(({ value, label }) => {
        const option = copy('tpl-choice') as HTMLOptionElement;
        option.value = value;
        option.textContent = label;
        return option;
      }),
    );
  for (const { fields } of [forms.patternCreate, forms.change]) [WEEKDAY_CHOICES, START_CHOICES, END_CHOICES].forEach((list, i) => choices(fields[i]!.input, list));
  for (const hint of nameHints) hint.textContent = TYPE_NAME_HINT;

  // 2. Pure view state (docs/FRONTEND_ARCHITECTURE.md section 3, rule 10): which type or
  // pattern each open dialog is about, and whether its action was asked for since it opened.
  // A result is shown only in the dialog that asked for it: a state keeps its last value,
  // which may be an earlier opening's.
  const open = { rename: { about: '', asked: false }, change: { about: '', asked: false } };
  let deleting: { kind: 'type' | 'pattern'; id: string } | null = null;
  let deleteAsked = false;
  const deletePending = { type: false, pattern: false };

  // 3. What a form holds, as text, and a form filled with given values.
  const held = (name: AskName) => Object.fromEntries(forms[name].fields.map(({ name: field, input }) => [field, input.value]));
  const fill = (name: AskName, values: Record<string, string>) => {
    for (const { name: field, input } of forms[name].fields) input.value = values[field]!;
  };
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
  // What a write says, in its form: each field in fault marked for a screen reader and for the
  // style sheet, its sentence under it; the failure; the appointments in the way. With no
  // outcome, nothing of it: the form of a dialog that opens.
  const say = (name: AskName, ask: Ask<string> | null) => {
    const { fields, failure, conflicts } = forms[name];
    for (const { name: field, input, refusal } of fields) {
      const why = ask?.refusals[field];
      refusal.textContent = why ?? '';
      if (why === undefined) input.removeAttribute('aria-invalid');
      else input.setAttribute('aria-invalid', 'true');
    }
    failure.textContent = ask?.failure ?? '';
    if (conflicts) showConflicts(conflicts, ask?.conflicts ?? null);
  };

  // 4. The dialogs: opening one is a pure view action, and it starts clean, with the values
  // of the row. Nothing is done when one closes: what it was about is replaced at the next
  // opening (a browser sends the close event late, perhaps after that opening).
  const openForm = (name: 'rename' | 'change', about: string, values: Record<string, string>) => {
    open[name] = { about, asked: false };
    fill(name, values);
    say(name, null);
    dialogs[name].showModal();
  };
  const openDelete = (kind: 'type' | 'pattern', id: string, words: string) => {
    deleting = { kind, id };
    deleteAsked = false;
    question.textContent = words;
    removeError.textContent = '';
    showConflicts(removeConflicts, null);
    removeSubmit.disabled = deletePending[kind];
    remove.showModal();
  };
  for (const name of ['rename', 'change'] as const) find(`dialog.${name} .close`).onclick = () => dialogs[name].close();
  find('dialog.delete .keep').onclick = () => remove.close();

  // 5. Drawing the lists: one copy of a template per row, filled with textContent. A button's
  // name for a screen reader says which row it is of; a click only opens a dialog.
  const button = (item: HTMLElement, selector: string, label: string, onclick: () => void) => {
    const element = item.querySelector<HTMLElement>(selector)!;
    element.setAttribute('aria-label', label);
    element.onclick = onclick;
  };
  const typeRow = (row: TypeRow) => {
    const item = copy('tpl-type-row');
    item.querySelector('.name')!.textContent = row.name;
    button(item, '.ask-rename', row.renameLabel, () => openForm('rename', row.typeId, { name: row.name }));
    button(item, '.ask-delete', row.deleteLabel, () => openDelete('type', row.typeId, deleteTypeQuestion(row)));
    return item;
  };
  const patternRow = (row: PatternRow) => {
    const item = copy('tpl-pattern-row');
    for (const key of ['time', 'typeName', 'validity'] as const) item.querySelector(`.${key === 'typeName' ? 'type-name' : key}`)!.textContent = row[key];
    item.querySelector<HTMLElement>('.ended')!.hidden = !row.ended;
    item.classList.toggle('is-ended', row.ended);
    button(item, '.ask-change', row.changeLabel, () => openForm('change', row.patternId, row.fields));
    button(item, '.ask-delete', row.deleteLabel, () => openDelete('pattern', row.patternId, deletePatternQuestion(row)));
    return item;
  };
  const groupFor = (group: PatternGroup) => {
    const section = copy('tpl-pattern-group');
    section.querySelector('h4')!.textContent = group.weekday;
    section.querySelector('.list')!.replaceChildren(...group.rows.map(patternRow));
    return section;
  };
  // What is now in the page: a list is rebuilt, and a form that creates is filled, only when
  // the stream brings another object for it, so the keyboard stays on a row's button and
  // what is being typed or chosen is left alone.
  let drawn: { types: readonly TypeRow[] | null; groups: readonly PatternGroup[] | null; choices: readonly Choice[] | null } = { types: null, groups: null, choices: null };
  let filled: { typeField: object | null; patternFields: object | null } = { typeField: null, patternFields: null };

  // 6. The user's actions become calls: what follows on screen comes from the streams. Without
  // preventDefault the browser would send a form itself and load the page again. The fields go
  // as they are, as text: the logic layer checks them.
  const onSubmit = (name: AskName, send: (values: Record<string, string>) => void) => {
    forms[name].form.onsubmit = (event) => {
      event.preventDefault();
      if (name === 'rename' || name === 'change') open[name].asked = true;
      send(held(name));
    };
  };
  onSubmit('typeCreate', ({ name }) => screen.createType(name!));
  onSubmit('rename', ({ name }) => screen.rename(open.rename.about, name!));
  onSubmit('patternCreate', (fields) => screen.createPattern(fields as PatternFields));
  onSubmit('change', (fields) => screen.change(open.change.about, fields as PatternFields));
  // The two deletes have nothing to check: the view calls the service that deletes.
  removeSubmit.onclick = () => {
    deleteAsked = true;
    if (deleting!.kind === 'type') types.remove(deleting!.id);
    else rules.deletePattern(deleting!.id);
  };
  find('.types .retry').onclick = () => screen.retryTypes();
  find('.patterns .retry').onclick = () => screen.retryPatterns();

  // 7. The streams' notifications fill the elements.
  const subscription = screen.availability$.subscribe((state) => {
    loading.hidden = !state.loading;
    for (const [list, unread, empty] of [[lists.types, state.typesUnread, state.typesEmpty], [lists.patterns, state.patternsUnread, state.patternsEmpty]] as const) {
      list.unread.hidden = unread === null;
      list.why.textContent = unread ?? '';
      list.empty.hidden = empty === null;
      list.empty.textContent = empty ?? '';
    }
    if (state.types !== drawn.types) lists.types.rows.replaceChildren(...(state.types ?? []).map(typeRow));
    if (state.groups !== drawn.groups) lists.patterns.rows.replaceChildren(...(state.groups ?? []).map(groupFor));
    // The types to choose from: a list that arrives leaves what is chosen as it is, in the
    // form and in the open dialog; a chosen type that is no longer there leaves none chosen.
    if (state.choices !== drawn.choices) {
      for (const select of typeLists) {
        const chosen = select.value;
        choices(select, state.choices);
        select.value = chosen;
      }
    }
    drawn = { types: state.types, groups: state.groups, choices: state.choices };
    for (const hint of typeHints) hint.textContent = state.typeHint;
    if (state.typeField !== filled.typeField) fill('typeCreate', state.typeField);
    if (state.patternFields !== filled.patternFields) fill('patternCreate', state.patternFields);
    filled = { typeField: state.typeField, patternFields: state.patternFields };
    // A button is disabled while a write of its kind is under way, whoever asked for it.
    for (const name of ['typeCreate', 'rename', 'patternCreate', 'change'] as const) forms[name].submit.disabled = state[name].busy;
    say('typeCreate', state.typeCreate);
    say('patternCreate', state.patternCreate);
    // A dialog shows an outcome only when it asked for it since it opened and the outcome is
    // about what the dialog is about; it stays open on a refusal and a failure, and closes
    // once the write is done.
    for (const name of ['rename', 'change'] as const) {
      if (!open[name].asked || state[name].about !== open[name].about) continue;
      say(name, state[name]);
      if (state[name].done) dialogs[name].close();
    }
  });
  // A delete: the button of the dialog is disabled while one of its kind is under way; the
  // dialog that asked for it closes on its success and shows its failure in plain words, with
  // the appointments in the way of a pattern's, staying open.
  const deleted = (kind: 'type' | 'pattern') => (state: RemoveTypeState | DeletePatternState) => {
    deletePending[kind] = state.status === 'pending';
    if (deleting?.kind !== kind) return;
    removeSubmit.disabled = deletePending[kind];
    if (!deleteAsked) return;
    removeError.textContent = state.status === 'failure' ? failureText(state.reason) : '';
    showConflicts(removeConflicts, state.status === 'failure' ? screen.conflicts(state.conflicts) : null);
    if (state.status === 'success') remove.close();
  };
  subscription.add(types.removeState$.subscribe(deleted('type')));
  subscription.add(rules.deletePatternState$.subscribe(deleted('pattern')));

  // 8. Leaving the view: the element stays in the page, only hidden, so the names, the
  // patterns, the appointments in the way and what was typed are removed before the next
  // screen, or the next person (docs/FRONTEND_ARCHITECTURE.md section 3, rule 9).
  subscription.add(() => {
    for (const dialog of [dialogs.rename, dialogs.change, remove]) dialog.close();
    for (const name of ['typeCreate', 'rename', 'patternCreate', 'change'] as const) {
      say(name, null);
      forms[name].form.reset();
      forms[name].submit.disabled = false;
      for (const { input } of forms[name].fields) if (input instanceof HTMLSelectElement) choices(input, []);
    }
    for (const list of [lists.types, lists.patterns]) {
      list.unread.hidden = list.empty.hidden = true;
      list.rows.replaceChildren();
    }
    showConflicts(removeConflicts, null);
    loading.hidden = true;
    removeSubmit.disabled = false;
    for (const text of [...nameHints, ...typeHints, lists.types.why, lists.types.empty, lists.patterns.why, lists.patterns.empty, question, removeError]) text.textContent = '';
  });
  return subscription;
}
